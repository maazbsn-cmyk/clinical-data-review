# Clinical Decision Support System (CDSS)

## A. Project Overview
**App Name:** Clinical Decision Support System (CDSS)
**Developer:** Maaz Ahmad
**Institution:** Khyber Medical University (KMU)

**The Problem:** During ward rotations and clinical emergencies, healthcare students and junior professionals face information overload. Processing messy, unformatted patient data, extracting text from handwritten ward sheets, and calculating critical scores (like GCS or MAP) under pressure can lead to delayed triage. Accessing verified, guideline-backed interventions instantly is difficult when cross-referencing physical books or generic search engines.

**The Solution:** The CDSS is a comprehensive, end-to-end web application that acts as a real-time clinical triage and evaluation tool. Designed specifically for health sciences students, it ingests raw clinical data, processes physical ward sheet images via OCR, and utilizes an AI reasoning engine to instantly generate concise, bulleted clinical priorities backed by peer-reviewed literature (e.g., AHA/ACC, WHO).

## B. Live Application
**Live URL:** (https://clinical-data-review-injk-maaaz.vercel.app/)

## C. Core Features
*   **AI Clinical Triage Engine:** Automatically parses unstructured, multi-patient scenarios into high-yield, discipline-specific management steps.
*   **Dual-Mode AI Routing (Fast Mode ⚡):** Standard requests route through Google Gemini for deep analysis with mandatory evidence-based references. If a user is in a hurry, clicking "Answer Now" instantly aborts the slow request and reroutes through Groq for immediate, low-latency protocols.
*   **Decoupled Database Logging:** AI generation is decoupled from logging. Background webhooks automatically format and push execution metadata and clean, markdown-free clinical reports to a secure, isolated cloud database for simulated academic audit trailing, without slowing down the UI.
*   **Optical Character Recognition (OCR):** Upload up to 10 physical ward sheet photos simultaneously; the app extracts the text locally using Tesseract.js for immediate clinical evaluation.
*   **Voice Dictation:** Hands-free patient history entry via the Web Speech API.
*   **Interactive Clinical Calculators:** Features real-time calculation for Glasgow Coma Scale (GCS), Body Mass Index (BMI), Mean Arterial Pressure (MAP), Maintenance Fluids (4-2-1 Rule), and IV Drip Rates.
*   **One-Click Calculator Interventions:** Direct integration between calculators and the AI backend to generate 2-3 line verified interventions based on calculated scores.
*   **Local History Vault:** Encrypted session storage saves all evaluated case reports locally, with a one-click "Master Batch Export" to compile all ward reports into a single printable TXT file.
*   **Contextual Sidebars:** Built-in cheat sheets for ABG interpretation, emergency protocols, and normal vitals.

## D. The AI Feature & System Instructions
**What it does:** The AI feature acts as a clinical reasoning engine. It takes raw text (either typed, voice-dictated, or OCR-extracted) or specific calculator outputs, and structures them into prioritized clinical actions.

**Dynamic System Prompts:**
The frontend dynamically injects strict prompts based on the tool being used to optimize token usage and response accuracy:
*   *Case Analyzer Prompts:* Enforce strict discipline-specific rules (Nursing, Pharmacy, Radiology, etc.), filter out non-clinical data, and mandate a distinct "Evidence-Based References" section.
*   *Calculator Prompts:* Highly optimized instructions that evaluate numeric scores (e.g., MAP or BMI) and output 2 to 3 rapid, universal clinical action steps, recognizing normal vs. abnormal states instantly.

## E. Tools, Services, and AI Models Used
*   **Frontend UI/UX:** HTML5, CSS3, Vanilla JavaScript (Mobile-First CSS Grid/Flexbox architecture).
*   **Backend & Hosting:** Node.js, deployed on Vercel Serverless Functions (`api/evaluate.js`).
*   **AI Provider & Models:** 
    *   *Primary Models:* Google `gemini-3.6-flash` & `gemini-3.5-flash`
    *   *Fast Mode / Groq Fallback Chain:*
        1. `llama-3.3-70b-versatile`
        2. `qwen/qwen3-32b`
        3. `openai/gpt-oss-120b`
    *   *Fallback Model:* Hugging Face `mistralai/Mixtral-8x7B-Instruct-v0.1`
*   **External Libraries:** 
    *   `Tesseract.js` (Client-side image-to-text OCR).
    *   `Marked.js` (Parsing AI Markdown responses into clean HTML).
*   **Database Sync:** Serverless Webhooks for background metadata logging and report generation.

## F. Application Screenshots

**PC Screenshots**
Patient Sample Data Input
<img width="1920" height="914" alt="image" src="https://github.com/user-attachments/assets/fce512d3-ef9f-4c83-9e7e-96afd90d755a" />
Evaluating
<img width="1920" height="915" alt="image" src="https://github.com/user-attachments/assets/2d991c56-d111-4fd9-a9dd-7aa1203c3020" />
Results
<img width="1920" height="916" alt="image" src="https://github.com/user-attachments/assets/ad1aa918-5a0e-4695-8fb2-872397520140" />
GCS
<img width="1920" height="918" alt="image" src="https://github.com/user-attachments/assets/5943b258-3e38-469a-8913-42646f077a0f" />
BMI (Dark Mode)
<img width="1920" height="915" alt="image" src="https://github.com/user-attachments/assets/c5cdf9eb-0128-401e-9b4e-45b4280f7329" />
MAP (Calculated In Dark Mode)
<img width="1920" height="918" alt="image" src="https://github.com/user-attachments/assets/02ab4a03-d793-4988-9907-36b747506ba4" />




**Mobile Screenshots**


## G. How to Run the Project Locally

1. Clone the repository: 
   `git clone https://github.com/maazbsn-cmyk/clinical-data-review.git`
   `cd clinical-data-review`

2. Install Vercel CLI: 
   `npm install -g vercel`

3. Configure Environment Variables: 
   Create a file named `.env` in the root directory and add: 
   ```env
   GEMINI_API_KEY=your_gemini_key
   GROQ_API_KEY=your_groq_key
   HF_API_KEY=your_huggingface_key
   SHEET_WEBHOOK_URL=your_metadata_webhook_url
   DOC_WEBHOOK_URL=your_report_webhook_url
4. Run the local development server: vercel dev

5. Open your browser and navigate to http://localhost:3000


## H. Clinical Governance & Compliance
**The Role of the Disclaimer Modal**

In real-world healthcare software deployment, patient safety and medical-legal liability are primary concerns. The mandatory "Clinical Use Disclaimer" integrated into this application serves three critical real-world functions:
1. **Mitigating Automation Bias:** It acts as a psychological pause, forcing junior clinicians to acknowledge that the AI is a decision-support tool, not an absolute diagnostic authority.
2. **Defining Scope of Practice:** It explicitly states that the application does not supersede or replace attending physician orders. 
3. **Legal Risk Management:** It establishes a base Terms of Service, protecting the institution and the developer from liability by requiring users to independently verify all AI-generated protocols against established hospital guidelines prior to clinical application.

---
*Disclaimer: This application is designed strictly for educational and academic use. It does not replace professional medical judgment, diagnosis, or treatment. Always correlate AI-generated insights with established clinical protocols and attending physician orders.*
