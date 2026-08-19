export const maxDuration = 60; 

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
                    body: JSON.stringify({ uniqueCode, discipline, scenario: rawInput, evaluation: docEvaluation })
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

    let evaluationResult = "";
    let currentModel = "";
    let lastErrorMessage = "Unknown API Error";
    const systemPrompt = scenario || rawInput; 

    async function callGemini(modelName, displayName) {
        if(!GEMINI_KEY) throw new Error(`Vercel is missing GEMINI_API_KEY for ${displayName}.`);
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: { maxOutputTokens: 8192 }
                }),
                signal: AbortSignal.timeout(45000)
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`Google API Rejected ${modelName}: ${errData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            return { text: data.candidates[0].content.parts[0].text.trim(), modelUsed: displayName };
        } catch (error) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                throw new Error(`${displayName} timed out after 45 seconds.`);
            }
            throw error;
        }
    }

    async function callGeminiWithFallbacks() {
        const geminiModels = [
            { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
            { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
            { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
            { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" }
        ];

        let geminiError = "";
        for (const m of geminiModels) {
            try {
                return await callGemini(m.id, m.label);
            } catch (err) {
                geminiError = err.message;
                console.warn(`${m.label} failed: ${err.message}`);
            }
        }
        throw new Error(geminiError);
    }

    async function callGroqModel(model) {
        if(!GROQ_KEY) throw new Error("Vercel is missing GROQ_API_KEY.");
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", 
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    model: model, 
                    messages: [{ role: "user", content: systemPrompt }],
                    max_tokens: 1500 
                }),
                signal: AbortSignal.timeout(45000)
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`Groq API Rejected ${model}: ${errData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                throw new Error(`Groq (${model}) timed out after 45 seconds.`);
            }
            throw error;
        }
    }

    async function callGroqWithFallbacks() {
        const groqModels = [
            { id: "groq/compound", label: "Groq (Compound)" },
            { id: "groq/compound-mini", label: "Groq (Compound Mini)" },
            { id: "openai/gpt-oss-120b", label: "Groq (GPT-OSS 120B)" },
            { id: "qwen/qwen3.6-27b", label: "Groq (Qwen 3.6 27B)" },
            { id: "openai/gpt-oss-20b", label: "Groq (GPT-OSS 20B)" },
            { id: "allam-2-7b", label: "Groq (Allam 2 7B)" }
        ];

        let groqError = "";
        for (const m of groqModels) {
            try {
                const text = await callGroqModel(m.id);
                return { text, modelUsed: m.label };
            } catch (err) {
                groqError = err.message;
                console.warn(`${m.label} failed: ${err.message}`);
            }
        }
        throw new Error(groqError);
    }

    // MAIN EXECUTION LOGIC
    if (fastMode) {
        try {
            const groqRes = await callGroqWithFallbacks();
            evaluationResult = groqRes.text;
            currentModel = groqRes.modelUsed;
        } catch (e1) {
            lastErrorMessage = e1.message;
            try {
                const gemRes = await callGeminiWithFallbacks();
                evaluationResult = gemRes.text;
                currentModel = gemRes.modelUsed;
            } catch (e2) {
                lastErrorMessage = e2.message;
                return res.status(500).json({ evaluation: `**SYSTEM DIAGNOSTIC ERROR**\n\nAll AI fallbacks failed. The final rejection reason from the API was:\n\n*${lastErrorMessage}*\n\nPlease check Vercel Environment Variables and Redeploy.`, modelUsed: "Failed" });
            }
        }
    } else {
        try {
            const gemRes = await callGeminiWithFallbacks();
            evaluationResult = gemRes.text;
            currentModel = gemRes.modelUsed;
        } catch (e1) {
            lastErrorMessage = e1.message;
            try {
                const groqRes = await callGroqWithFallbacks();
                evaluationResult = groqRes.text;
                currentModel = groqRes.modelUsed;
            } catch (e2) {
                lastErrorMessage = e2.message;
                return res.status(500).json({ evaluation: `**SYSTEM DIAGNOSTIC ERROR**\n\nAll AI fallbacks failed. The final rejection reason from the API was:\n\n*${lastErrorMessage}*\n\nPlease check Vercel Environment Variables and Redeploy.`, modelUsed: "Failed" });
            }
        }
    }

    return res.status(200).json({ evaluation: evaluationResult, modelUsed: currentModel });
}
