export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { scenario, discipline, tool = "General Tool" } = req.body;

    // 1. Extract User Location and IP automatically provided by Vercel
    const ip = req.headers['x-forwarded-for'] || 'Unknown IP';
    const city = req.headers['x-vercel-ip-city'] || 'Unknown City';
    const country = req.headers['x-vercel-ip-country'] || 'Unknown Country';
    const location = `${city}, ${country}`.replace(/^,\s/, '');

    // 2. Load Environment Variables
    const SHEET_WEBHOOK = process.env.GOOGLE_WEBHOOK_URL;
    const HF_KEY = process.env.HF_API_KEY;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    let evaluationResult = "";
    let modelUsed = "";

    // -- FALLBACK AI FUNCTIONS --

    // Priority 1: Hugging Face (Mistral/Medical open weights)
    async function callHuggingFace() {
        if(!HF_KEY) throw new Error("No HF Key");
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: scenario, parameters: { max_new_tokens: 500 } })
        });
        if (!response.ok) throw new Error("Hugging Face API failed or is asleep");
        const data = await response.json();
        return data[0].generated_text.replace(scenario, "").trim();
    }

    // Priority 2: Google Gemini (High Capacity)
    async function callGemini() {
        if(!GEMINI_KEY) throw new Error("No Gemini Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: scenario }] }] })
        });
        if (!response.ok) throw new Error("Gemini API failed");
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    // Priority 3: Groq (Ultra-Fast Fallback)
    async function callGroq() {
        if(!GROQ_KEY) throw new Error("No Groq Key");
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: scenario }] })
        });
        if (!response.ok) throw new Error("Groq API failed");
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    // 3. Execute Priority Chain
    try {
        evaluationResult = await callHuggingFace();
        modelUsed = "Hugging Face (Mixtral)";
    } catch (e1) {
        try {
            evaluationResult = await callGemini();
            modelUsed = "Gemini 1.5 Flash";
        } catch (e2) {
            try {
                evaluationResult = await callGroq();
                modelUsed = "Groq (Llama 3.3)";
            } catch (e3) {
                return res.status(500).json({ evaluation: "Error: All AI APIs failed or keys are missing.", modelUsed: "Failed" });
            }
        }
    }

    // 4. Fire Data to Google Sheets
    if (SHEET_WEBHOOK) {
        try {
            await fetch(SHEET_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ipAddress: ip, location, discipline, tool, modelUsed, scenario, evaluation: evaluationResult })
            });
        } catch (err) { 
            console.error("Google Sheets Sync Failed", err); 
        }
    }

    // 5. Send result back to Frontend
    res.status(200).json({ evaluation: evaluationResult, modelUsed });
}
