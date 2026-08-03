export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // Extracted feedback variables added
    const { action = "evaluate", scenario = "", rawInput = "", discipline = "Nursing", tool = "General Tool", fastMode = false, evaluation = "", modelUsed = "Unknown Model", name = "", department = "", category = "", feedback = "" } = req.body;

    const ip = req.headers['x-forwarded-for'] || 'Unknown IP';
    const city = req.headers['x-vercel-ip-city'] || 'Unknown City';
    const country = req.headers['x-vercel-ip-country'] || 'Unknown Country';
    const location = `${city}, ${country}`.replace(/^,\s/, '');

    // ==========================================
    // ACTION 1: BACKGROUND SAVING (WEBHOOKS)
    // ==========================================
    if (action === "save") {
        const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK_URL;
        const DOC_WEBHOOK = process.env.DOC_WEBHOOK_URL;
        let uniqueCode = "UID-PENDING";

        if (SHEET_WEBHOOK) {
            try {
                const sheetRes = await fetch(SHEET_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ipAddress: ip, location, discipline, tool, modelUsed })
                });
                const text = await sheetRes.text();
                if (text && !text.startsWith("Error")) {
                    uniqueCode = text.trim();
                }
            } catch (err) { 
                console.error("Sheet sync failed", err); 
            }
        }

        if (DOC_WEBHOOK) {
            let docEvaluation = evaluation.split(/(?:\n|^)(?:#{1,6}|\*\*|\*)*\s*(?:Evidence-?Based\s+)?References:?/i)[0]
                .replace(/\*\*(.*?)\*\*/g, '$1') 
                .replace(/(^\s*\*|\n\s*\*)\s/g, '\n• ') 
                .replace(/#{1,6}\s?/g, '')       
                .trim();

            try {
                await fetch(DOC_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueCode, scenario: rawInput, evaluation: docEvaluation })
                });
            } catch (err) { 
                console.error("Doc sync failed", err); 
            }
        }

        return res.status(200).json({ success: true, uniqueCode });
    }

    // ==========================================
    // ACTION 1.5: FEEDBACK ROUTING (NO AI)
    // ==========================================
    if (action === "feedback") {
        const FEEDBACK_WEBHOOK = process.env.FEEDBACK_WEBHOOK_URL;
        if (!FEEDBACK_WEBHOOK) {
            return res.status(500).json({ success: false, error: "Feedback Webhook URL not configured in Vercel." });
        }

        try {
            await fetch(FEEDBACK_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, department, category, feedback })
            });
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error("Feedback sync failed", err);
            return res.status(500).json({ success: false, error: "Failed to send feedback to Google Docs." });
        }
    }

    // ==========================================
    // ACTION 2: AI EVALUATION
    // ==========================================
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;
    const HF_KEY = process.env.HF_API_KEY;

    let evaluationResult = "";
    let currentModel = "";
    const systemPrompt = scenario || rawInput; 

    async function callGemini36() {
        if(!GEMINI_KEY) throw new Error("No Gemini 3.6 Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { maxOutputTokens: 8192 }
            })
        });
        if (!response.ok) throw new Error("Gemini 3.6 Flash failed");
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    async function callGemini35() {
        if(!GEMINI_KEY) throw new Error("No Gemini 3.5 Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { maxOutputTokens: 8192 }
            })
        });
        if (!response.ok) throw new Error("Gemini 3.5 Flash failed");
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    async function callGroqModel(model) {
        if(!GROQ_KEY) throw new Error("No Groq Key");
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", 
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ 
                model: model, 
                messages: [{ role: "user", content: systemPrompt }],
                max_tokens: 8000
            })
        });
        if (!response.ok) throw new Error(`Groq (${model}) failed`);
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    // Sequential Groq model fallback execution
    async function callGroqWithFallbacks() {
        const groqModels = [
            { id: "llama-3.3-70b-versatile", label: "Groq (Llama 3.3 70B)" },
            { id: "qwen/qwen3-32b", label: "Groq (Qwen 3 32B)" },
            { id: "openai/gpt-oss-120b", label: "Groq (GPT-OSS 120B)" }
        ];

        for (const m of groqModels) {
            try {
                const text = await callGroqModel(m.id);
                return { text, modelUsed: m.label };
            } catch (err) {
                console.warn(`${m.label} failed. Trying next Groq model...`);
            }
        }
        throw new Error("All Groq models failed");
    }

    async function callHuggingFace() {
        if(!HF_KEY) throw new Error("No HF Key");
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
            method: "POST", headers: { "Authorization": `Bearer ${HF_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: systemPrompt, parameters: { max_new_tokens: 4000, return_full_text: false } })
        });
        if (!response.ok) throw new Error("Hugging Face failed");
        const data = await response.json();
        return data[0].generated_text.trim();
    }

    if (fastMode) {
        try {
            const groqRes = await callGroqWithFallbacks();
            evaluationResult = groqRes.text;
            currentModel = groqRes.modelUsed;
        } catch (e1) {
            try {
                evaluationResult = await callGemini36();
                currentModel = "Gemini 3.6 Flash";
            } catch (e2) {
                return res.status(500).json({ evaluation: "Error: Fast AI models failed.", modelUsed: "Failed" });
            }
        }
    } else {
        try {
            evaluationResult = await callGemini36();
            currentModel = "Gemini 3.6 Flash";
        } catch (e1) {
            try {
                evaluationResult = await callGemini35();
                currentModel = "Gemini 3.5 Flash";
            } catch (e2) {
                try {
                    const groqRes = await callGroqWithFallbacks();
                    evaluationResult = groqRes.text;
                    currentModel = groqRes.modelUsed;
                } catch (e3) {
                    try {
                        evaluationResult = await callHuggingFace();
                        currentModel = "Hugging Face (Mixtral 8x7B)";
                    } catch (e4) {
                        return res.status(500).json({ evaluation: "Error: All AI models failed.", modelUsed: "Failed" });
                    }
                }
            }
        }
    }

    return res.status(200).json({ evaluation: evaluationResult, modelUsed: currentModel });
}
