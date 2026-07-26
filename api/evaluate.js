export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { rawInput, discipline, tool = "General Tool" } = req.body;

    const ip = req.headers['x-forwarded-for'] || 'Unknown IP';
    const city = req.headers['x-vercel-ip-city'] || 'Unknown City';
    const country = req.headers['x-vercel-ip-country'] || 'Unknown Country';
    const location = `${city}, ${country}`.replace(/^,\s/, '');

    const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK_URL;
    const DOC_WEBHOOK = process.env.DOC_WEBHOOK_URL;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;
    const HF_KEY = process.env.HF_API_KEY;

    let evaluationResult = "";
    let modelUsed = "";

    const systemPrompt = `
CRITICAL SYSTEM INSTRUCTIONS: MULTI-DISCIPLINARY CLINICAL DATA ANALYSIS
TARGET DISCIPLINE: ${discipline}

1. VALIDATION & GUARDRAILS:
- GUARDRAIL 1 (Irrelevant Data): If the input contains profanity, jokes, video games, or non-clinical text, reply strictly with: "Irrelevant or invalid data provided. Please enter a valid clinical patient scenario."
- GUARDRAIL 2 (Normal Findings): If the findings are completely normal/stable, state: "Values are within normal limits. No acute interventions required. Continue routine monitoring."

2. CROSS-DISCIPLINE TRIAGE & SAFETY RULE:
- If the patient scenario describes a critical medical emergency (e.g., cardiac arrest, acute myocardial infarction, stroke, anaphylaxis, status epilepticus) and the target discipline is secondary (e.g., Dental, Pharmacy, Radiology), YOU MUST START WITH A WARNING: "CRITICAL ALERT: Prioritize emergency medical/nursing intervention and stabilization first. Secondary discipline actions delayed." Then provide safe, scope-limited insights.

3. DISCIPLINE-SPECIFIC FOCUS:
- Nursing: Immediate assessment, vitals monitoring, primary care actions.
- Radiology: Urgent imaging protocols, abnormality identification.
- Pharmacy: Medication review, contraindications, safety.
- Anaesthesia: Preop risk, airway, sedation considerations.
- Medical Laboratory Technology (MLT): Lab value interpretation, abnormal patterns.
- Dental Sciences: Oral health assessment, dental pathologies.

4. FORMATTING, TONE & MANDATORY REFERENCES:
- Provide a prioritized, actionable intervention plan using 3 to 4 concise bullet points.
- Maintain a direct, professional clinical tone.
- MANDATORY: You must conclude the response with a distinct section titled "### Evidence-Based References" citing 1 to 2 authoritative sources (WHO, CDC, NICE, or peer-reviewed clinical guidelines).

PATIENT DATA:
${rawInput}
    `;

    async function callGemini36() {
        if(!GEMINI_KEY) throw new Error("No Gemini 3.6 Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
        });
        if (!response.ok) throw new Error("Gemini 3.6 Flash failed");
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    async function callGemini35() {
        if(!GEMINI_KEY) throw new Error("No Gemini 3.5 Key");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
        });
        if (!response.ok) throw new Error("Gemini 3.5 Flash failed");
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    async function callGroq() {
        if(!GROQ_KEY) throw new Error("No Groq Key");
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: systemPrompt }] })
        });
        if (!response.ok) throw new Error("Groq failed");
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    async function callHuggingFace() {
        if(!HF_KEY) throw new Error("No HF Key");
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: systemPrompt, parameters: { max_new_tokens: 800, return_full_text: false } })
        });
        if (!response.ok) throw new Error("Hugging Face failed");
        const data = await response.json();
        return data[0].generated_text.trim();
    }

    try {
        evaluationResult = await callGemini36();
        modelUsed = "Gemini 3.6 Flash";
    } catch (e1) {
        try {
            evaluationResult = await callGemini35();
            modelUsed = "Gemini 3.5 Flash";
        } catch (e2) {
            try {
                evaluationResult = await callGroq();
                modelUsed = "Groq (Llama 3.3 70B)";
            } catch (e3) {
                try {
                    evaluationResult = await callHuggingFace();
                    modelUsed = "Hugging Face (Mixtral 8x7B)";
                } catch (e4) {
                    return res.status(500).json({ evaluation: "Error: All AI models failed.", modelUsed: "Failed" });
                }
            }
        }
    }

    // --- CLEANING SECTION FOR GOOGLE DOCS ---
    // 1. Chops off everything from "Evidence-Based References" downwards
    let docEvaluation = evaluationResult.split(/###?\s*Evidence-Based References/i)[0];
    
    // 2. Removes **, replaces * with a clean bullet •, and removes # tags
    docEvaluation = docEvaluation
        .replace(/\*\*(.*?)\*\*/g, '$1') 
        .replace(/(^\s*\*|\n\s*\*)\s/g, '\n• ') 
        .replace(/#{1,6}\s?/g, '')       
        .trim();

    let uniqueCode = "UID-PENDING";

    if (SHEET_WEBHOOK) {
        try {
            const sheetRes = await fetch(SHEET_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    ipAddress: ip, 
                    location: location, 
                    discipline: discipline, 
                    tool: tool, 
                    modelUsed: modelUsed 
                }),
                redirect: 'follow'
            });
            const text = await sheetRes.text();
            if (text && !text.startsWith("Error")) {
                uniqueCode = text.trim();
            }
        } catch (err) { 
            console.error("Sheet sync failed", err); 
        }
    }

    // ONLY sends the clean data (UID, Input, and Cleaned Evaluation) to Google Docs
    if (DOC_WEBHOOK) {
        try {
            await fetch(DOC_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    uniqueCode: uniqueCode,
                    scenario: rawInput, 
                    evaluation: docEvaluation 
                }),
                redirect: 'follow'
            });
        } catch (err) { 
            console.error("Doc sync failed", err); 
        }
    }

    // Frontend still gets the full evaluationResult with formatting and references
    res.status(200).json({ evaluation: evaluationResult, modelUsed });
}
