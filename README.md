# Clinical Decision Support System (CDSS) - TPIHS

## A. Project Overview
**App Name:** Clinical Decision Support System (CDSS)
**Developer:** Maaz Ahmad
**Institution:** The Professional Institute of Health Sciences Mardan (affiliated with KMU Peshawar)

**The Problem:** During ward rotations and clinical emergencies, healthcare students and junior professionals face information overload. Processing messy, unformatted patient data, extracting text from handwritten ward sheets, and calculating critical scores (like GCS or MAP) under pressure can lead to delayed triage. Accessing verified, guideline-backed interventions instantly is difficult when cross-referencing physical books or generic search engines.

**The Solution:** The CDSS is a comprehensive, end-to-end web application that acts as a real-time clinical triage and evaluation tool. Designed specifically for health sciences students, it ingests raw clinical data, processes physical ward sheet images via OCR, and utilizes an AI reasoning engine to instantly generate concise, bulleted clinical priorities backed by peer-reviewed literature (e.g., AHA/ACC, WHO).

## B. Live Application
**Live URL:** https://clinical-data-review-injk-gsszwjni7-maaaz.vercel.app/

## C. Core Features
*   **AI Clinical Triage Engine:** Automatically parses unstructured, multi-patient scenarios into high-yield, discipline-specific management steps.
*   **Optical Character Recognition (OCR):** Upload up to 10 physical ward sheet photos simultaneously; the app extracts the text locally using Tesseract.js for immediate clinical evaluation.
*   **Voice Dictation:** Hands-free patient history entry via the Web Speech API.
*   **Interactive Clinical Calculators:** Features real-time calculation for Glasgow Coma Scale (GCS), Body Mass Index (BMI), Mean Arterial Pressure (MAP), and Maintenance Fluids (4-2-1 Rule).
*   **One-Click Calculator Interventions:** Direct integration between calculators and the AI backend to generate 2-3 line verified interventions based on calculated scores.
*   **Local History Vault:** Encrypted session storage saves all evaluated case reports locally, with a one-click "Master Batch Export" to compile all ward reports into a single printable TXT/PDF file.
*   **Contextual Sidebars:** Built-in cheat sheets for ABG interpretation, emergency protocols, and normal vitals.
*   **Dual-Theme UI:** A persistent Light/Dark mode switcher optimized for both bright wards and low-light radiology rooms.

## D. The AI Feature & System Instructions
**What it does:** The AI feature acts as a clinical reasoning engine. It takes raw text (either typed, voice-dictated, or OCR-extracted) or specific calculator outputs, and structures them into prioritized clinical actions.

**System Prompts:**
The backend utilizes dynamic prompt injection based on the selected medical discipline. 
*Base System Prompt snippet:*
> "You are an expert clinical reasoning engine for TPIHS KMU health sciences. 
> CRITICAL RULE 1: KEEP IT SHORT, CONCISE, AND HIGH-YIELD. Use brief, bulleted priority lists ideal for quick examination review. You MUST use bold text (**...**) for key medical terms, metrics, and headings. 
> CRITICAL RULE 2: DO NOT include any 'Patient Profile', 'Clinical Presentation', or 'Vital Signs' summary sections. Jump DIRECTLY into key management steps. 
> CRITICAL RULE 3: Tailor the output strictly to the [Discipline] domain. 
> CRITICAL RULE 4: Automatically append a dedicated '### Evidence-Based References' section at the very bottom formatted as clean bullet points citing actual, peer-reviewed professional medical literature and official guidelines."

## E. Tools, Services, and AI Models Used
*   **Frontend UI/UX:** HTML5, CSS3, Vanilla JavaScript (Mobile-First CSS Grid/Flexbox architecture).
*   **Backend & Hosting:** Node.js, deployed on Vercel Serverless Functions (`api/evaluate.js`).
*   **AI Provider & Models:** Hosted via Groq API. 
    *   *Primary Model:* `llama-3.3-70b-versatile`
    *   *Fallback Models:* `qwen/qwen3-32b`, `openai/gpt-oss-120b`, `llama-3.1-8b-instant`.
*   **External Libraries:** 
    *   `Tesseract.js` (Client-side image-to-text OCR).
    *   `Marked.js` (Parsing AI Markdown responses into clean HTML).

## F. Application Screenshots
[Replace this text with Dashboard Screenshot]

[Replace this text with Mobile View Screenshot]

[Replace this text with AI Evaluation Screenshot]

## G. How to Run the Project Locally
1. **Clone the repository:**
   ```bash
   git clone [INSERT YOUR GITHUB REPO URL HERE]
   cd [YOUR REPO FOLDER NAME]
