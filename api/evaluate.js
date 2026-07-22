module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ evaluation: 'Method Not Allowed' });
    }

    try {
        let body = req.body;
        if (!body) {
            return res.status(400).json({ evaluation: 'Request body is missing.' });
        }
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }

        const { scenario, discipline } = body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ evaluation: 'ERROR: GROQ_API_KEY is missing from Vercel Environment Variables.' });
        }

        const prompts = {
            "Nursing": "Focus strictly on immediate nursing care plans, triage level, vitals monitoring, IV access, bed position, nursing interventions, and emergency drug administration protocols.",
            "Radiology": "Focus strictly on radiological imaging protocols, emergency imaging indications (X-Ray, CT, MRI, Ultrasound), contrast considerations, radiation safety, and critical image findings to report.",
            "Dental": "Focus strictly on oral/maxillofacial considerations, emergency dental management, local anesthesia considerations, systemic medical emergency protocol in a dental clinic, and deferred oral procedures.",
            "Anaesthesia": "Focus strictly on airway evaluation (Mallampati), hemodynamic stability, emergency anesthesia considerations, rapid sequence induction (RSI) risks, and critical care ventilation monitoring.",
            "Pharmacy": "Focus strictly on pharmacological interventions, emergency drug dosages, drug interactions, contraindications, administration routes, and therapeutic drug monitoring.",
            "Medical Laboratory Technology": "Focus strictly on urgent STAT laboratory investigations, blood sampling tubes, diagnostic markers (Troponin, CBC, Arterial Blood Gases), turnaround times, and critical lab values."
        };

        const specificInstruction = prompts[discipline] || prompts["Nursing"];

        const systemPrompt = `You are an expert clinical reasoning engine for TPIHS KMU health sciences, utilizing verified evidence-based clinical standards.
CRITICAL RULE 1: DO NOT include any 'Patient Profile', 'Clinical Presentation', or 'Vital Signs' summary sections. Jump DIRECTLY into clinical management.
CRITICAL RULE 2: Tailor the output 100% specifically to the ${discipline} domain. 
Specific Scope: ${specificInstruction}

Output PURE MARKDOWN text with clear section headers (###) and bullet points. Do not wrap the response in JSON object syntax.

Case Scenario: ${scenario}`;

        const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
        let evaluationText, usedModel;

        for (const model of models) {
            try {
                const apiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: "You are a precise clinical assistant that outputs clean markdown text without JSON formatting." },
                            { role: "user", content: systemPrompt }
                        ],
                        temperature: 0.2
                    })
                });

                if (apiResponse.ok) {
                    const json = await apiResponse.json();
                    if (json.choices && json.choices[0] && json.choices[0].message) {
                        evaluationText = json.choices[0].message.content;
                        usedModel = model;
                        break;
                    }
                }
            } catch (err) {
                continue;
            }
        }

        if (!evaluationText) {
            return res.status(500).json({ evaluation: "All backup Groq models failed or hit rate limits. Please try again shortly.", modelUsed: "Error" });
        }

        return res.status(200).json({
            evaluation: evaluationText,
            modelUsed: usedModel
        });
    } catch (error) {
        return res.status(500).json({ evaluation: "Server error: " + error.message, modelUsed: "Error" });
    }
};
