export const maxDuration = 60; // Forces Vercel to allow up to 60 seconds of execution

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
    // ACTION 2: AI EVALUATION (WITH 45-SEC TIMEOUTS & NEW FALLBACKS)
    // ==========================================
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    let evaluationResult = "";
    let currentModel = "";
    let lastErrorMessage = "Unknown API Error";
    const systemPrompt = scenario || rawInput; 

    // Advanced Gemini Caller with Strict 45-Second Timeout
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
                signal: AbortSignal.timeout(45000) // 45 SECOND TIMEOUT
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

    // Advanced Groq Caller with Strict 45-Second Timeout
    async function callGroqModel(model) {
        if(!GROQ_KEY) throw new Error("Vercel is missing GROQ_API_KEY.");
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", 
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    model: model, 
                    messages: [{ role: "user", content: systemPrompt }],
                    max_tokens: 8000
                }),
                signal: AbortSignal.timeout(45000) // 45 SECOND TIMEOUT
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

    // New Bulletproof Groq Fallback Chain
    async function callGroqWithFallbacks() {
        const groqModels = [
            { id: "llama-3.3-70b-versatile", label: "Groq (Llama 3.3 70B)" },
            { id: "openai/gpt-oss-120b", label: "Groq (GPT-OSS 120B)" },
            { id: "qwen/qwen3.6-27b", label: "Groq (Qwen 3.6 27B)" },
            { id: "groq/compound", label: "Groq (Compound)" },
            { id: "llama-3.1-8b-instant", label: "Groq (Llama 3.1 8B)" }
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

    // Main Execution Chain
    if (fastMode) {
        try {
            const groqRes = await callGroqWithFallbacks();
            evaluationResult = groqRes.text;
            currentModel = groqRes.modelUsed;
        } catch (e1) {
            lastErrorMessage = e1.message;
            try {
                const gemRes = await callGemini('gemini-3.6-flash', 'Gemini 3.6 Flash');
                evaluationResult = gemRes.text;
                currentModel = gemRes.modelUsed;
            } catch (e2) {
                lastErrorMessage = e2.message;
                return res.status(500).json({ evaluation: `**SYSTEM DIAGNOSTIC ERROR**\n\nAll AI fallbacks failed. The final rejection reason from the API was:\n\n*${lastErrorMessage}*\n\nPlease check Vercel Environment Variables and Redeploy.`, modelUsed: "Failed" });
            }
        }
    } else {
        try {
            // Priority 1: User's chosen 3.6 Flash
            const gemRes = await callGemini('gemini-3.6-flash', 'Gemini 3.6 Flash');
            evaluationResult = gemRes.text;
            currentModel = gemRes.modelUsed;
        } catch (e1) {
            lastErrorMessage = e1.message;
            try {
                // Priority 2: Safe drop to 3.5 Flash
                const gemRes2 = await callGemini('gemini-3.5-flash', 'Gemini 3.5 Flash');
                evaluationResult = gemRes2.text;
                currentModel = gemRes2.modelUsed;
            } catch (e2) {
                lastErrorMessage = e2.message;
                try {
                    // Priority 3: Deep Groq Fallback Cascade (NO GEMINI 1.5)
                    const groqRes = await callGroqWithFallbacks();
                    evaluationResult = groqRes.text;
                    currentModel = groqRes.modelUsed;
                } catch (e3) {
                    lastErrorMessage = e3.message;
                    return res.status(500).json({ evaluation: `**SYSTEM DIAGNOSTIC ERROR**\n\nAll AI fallbacks failed. The final rejection reason from the API was:\n\n*${lastErrorMessage}*\n\nPlease check Vercel Environment Variables and Redeploy.`, modelUsed: "Failed" });
                }
            }
        }
    }

    return res.status(200).json({ evaluation: evaluationResult, modelUsed: currentModel });
}
