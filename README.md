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
*   **Decoupled Database Logging:** AI generation is decoupled from logging. Background webhooks automatically format and push execution metadata and clean, markdown-free clinical reports to a secure, isolated cloud datab
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
    *   *Fast Mode / Secondary:* Groq `llama-3.3-70b-versatile`
    *   *Fallback Model:* Hugging Face `mistralai/Mixtral-8x7B-Instruct-v0.1`
*   **External Libraries:** 
    *   `Tesseract.js` (Client-side image-to-text OCR).
    *   `Marked.js` (Parsing AI Markdown responses into clean HTML).
*   **Database Sync:** Google Apps Script Webhooks (Google Sheets & Google Docs).

## F. Application Screenshots

**PC Screenshots**


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
   SHEET_WEBHOOK_URL=your_google_sheet_script_url
   DOC_WEBHOOK_URL=your_google_doc_script_url
4. Run the local development server:vercel dev

5. Open your browser and navigate to http://localhost:3000

Disclaimer: This application is designed strictly for educational and academic use. It does not replace professional medical judgment, diagnosis, or treatment. Always correlate AI-generated insights with established clinical protocols and attending physician orders.
