export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

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
    // ACTION 1.5: FEEDBACK ROUTING
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

    // Dynamic Gemini Caller
    async function callGemini(modelName, displayName) {
        if(!GEMINI_KEY) throw new Error("No Gemini Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { maxOutputTokens: 8192 }
            })
        });
        if (!response.ok) {
            const errData = await response.text();
            throw new Error(`Gemini ${modelName} API Error: ${errData}`);
        }
        const data = await response.json();
        return { text: data.candidates[0].content.parts[0].text.trim(), modelUsed: displayName };
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
        // Fast Mode prioritizes Groq for speed
        try {
            const groqRes = await callGroqWithFallbacks();
            evaluationResult = groqRes.text;
            currentModel = groqRes.modelUsed;
        } catch (e1) {
            try {
                const gemRes = await callGemini('gemini-1.5-flash', 'Gemini 1.5 Flash');
                evaluationResult = gemRes.text;
                currentModel = gemRes.modelUsed;
            } catch (e2) {
                return res.status(500).json({ evaluation: "Error: Fast AI models failed.", modelUsed: "Failed" });
            }
        }
    } else {
        // Standard Mode prioritizes Google Gemini cascade
        try {
            const gemRes = await callGemini('gemini-3.6-flash', 'Gemini 3.6 Flash');
            evaluationResult = gemRes.text;
            currentModel = gemRes.modelUsed;
        } catch (e1) {
            console.error(e1);
            try {
                const gemRes2 = await callGemini('gemini-3.5-flash', 'Gemini 3.5 Flash');
                evaluationResult = gemRes2.text;
                currentModel = gemRes2.modelUsed;
            } catch (e2) {
                console.error(e2);
                try {
                    const gemRes3 = await callGemini('gemini-1.5-flash', 'Gemini 1.5 Flash');
                    evaluationResult = gemRes3.text;
                    currentModel = gemRes3.modelUsed;
                } catch (e3) {
                    console.error(e3);
                    try {
                        const groqRes = await callGroqWithFallbacks();
                        evaluationResult = groqRes.text;
                        currentModel = groqRes.modelUsed;
                    } catch (e4) {
                        console.error(e4);
                        return res.status(500).json({ evaluation: "Error: All AI models failed. Verify API keys and network.", modelUsed: "Failed" });
                    }
                }
            }
        }
    }

    return res.status(200).json({ evaluation: evaluationResult, modelUsed: currentModel });
}
