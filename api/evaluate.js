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

        const systemPrompt = `You are an expert clinical reasoning engine for KMU health sciences. 
CRITICAL RULE 1: DO NOT include any 'Patient Profile', 'Clinical Presentation', or 'Vital Signs' summary sections in your response. Jump DIRECTLY into clinical management.
CRITICAL RULE 2: Tailor the output 100% specifically to the ${discipline} domain. 
Specific Scope: ${specificInstruction}

Format the output strictly as a JSON object with a single key named "evaluation". Use bolding and markdown bullet points for actionable steps.

Case Scenario: ${scenario}`;

        const apiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: systemPrompt }],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        const responseText = await apiResponse.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (err) {
            return res.status(500).json({ evaluation: `Groq non-JSON response: ${responseText}` });
        }

        if (!apiResponse.ok) {
            return res.status(500).json({ evaluation: `Groq API Error: ${data.error?.message || responseText}` });
        }

        const content = data.choices[0].message.content;
        let resultContent;
        try {
            resultContent = JSON.parse(content);
        } catch (e) {
            resultContent = { evaluation: content };
        }

        return res.status(200).json(resultContent);
    } catch (error) {
        return res.status(500).json({ evaluation: "Server error: " + error.message });
    }
};
