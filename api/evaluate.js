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
            return res.status(500).json({ evaluation: 'GROQ_API_KEY is missing from Vercel environment variables. Please check your Vercel project settings.' });
        }

        const prompt = `You are an expert clinical reasoning engine. The user is an 8th-semester KMU student in the ${discipline} department. Evaluate this patient case and provide a highly detailed, step-by-step clinical priority breakdown ONLY for their specific discipline. Output a strict JSON object with a single key named "evaluation" containing this detailed explanation. Case: ${scenario}`;

        const apiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2
            })
        });

        const data = await apiResponse.json();
        
        if (!apiResponse.ok) {
            return res.status(500).json({ evaluation: `Groq API Error: ${data.error?.message || JSON.stringify(data)}` });
        }

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            return res.status(500).json({ evaluation: "Invalid response structure received from Groq API." });
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
