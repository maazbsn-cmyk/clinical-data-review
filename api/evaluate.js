export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { scenario, discipline } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    const prompt = `You are an expert clinical reasoning engine. The user is an 8th-semester KMU student in the ${discipline} department. Evaluate this patient case and provide a highly detailed, step-by-step clinical priority breakdown ONLY for their specific discipline. Output a strict JSON object with a single key named "evaluation" containing this detailed explanation. Case: ${scenario}`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

        const data = await response.json();
        const resultContent = JSON.parse(data.choices[0].message.content);
        res.status(200).json(resultContent);
    } catch (error) {
        res.status(500).json({ evaluation: "Error processing the request. Please check the backend connection." });
    }
}
