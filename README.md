# AEC VAP Project Documentation

This README provides a comprehensive and detailed explanation of each directory and file in the `AEC VAP` project, outlining their purpose and providing a code-level explanation of how they function.

## 📂 Root Directory Files

### 1. `.env`
- **Purpose**: Stores sensitive environment variables.
- **Code Explanation**: Normally contains key-value pairs like `GROQ_API_KEY=your_key`, `MONGO_URI=mongodb://...`, and `JWT_SECRET=my_secret`. It keeps sensitive data out of version control. The application loads this file using `require('dotenv').config()`.

### 2. `package.json` & `package-lock.json`
- **Purpose**: Node.js project configuration and dependency management.
- **Code Explanation**: `package.json` contains metadata and scripts (like `"start": "node backend/server.js"`). It declares all libraries required for the project, such as `express`, `mongoose`, `socket.io`, `groq-sdk`, `multer`, `tesseract.js`, etc. `package-lock.json` guarantees exact version locking of these dependencies across environments.

### 3. `data.json`
- **Purpose**: A local placeholder or scratchpad for JSON data.
- **Code Explanation**: Currently an empty JSON object `{}`. Developers can use it to test data structures or quickly dump/read mock data during development.

### 4. `eng.traineddata`
- **Purpose**: Trained language data file for Tesseract OCR.
- **Code Explanation**: Required by the `tesseract.js` package to accurately identify and extract English text from uploaded images. It acts as the local model for the OCR engine.

### 5. `list_models.js`
- **Purpose**: Standalone script to fetch available AI models from Groq.
- **Code Explanation**: 
  - Uses `dotenv` to load the `GROQ_API_KEY`.
  - Initializes `Groq` client.
  - Asynchronously calls `groq.models.list()` and iterates over the returned data array, mapping out the `id` of each model and logging it to the console. Helpful for developers to see which models are supported by the API.

---

## 📁 `backend/` Directory
Contains the core server logic of the application.

### `backend/server.js`
- **Purpose**: The main entry point for the backend API, WebSocket server, and AI integration.
- **Code Explanation**:
  - **Setup**: Initializes `express`, configuring standard middleware (CORS, JSON parsing), connects to MongoDB via `mongoose.connect()`, and creates a `socket.io` server attached to the HTTP server.
  - **Helper Functions**: Implements `safeJSONParse(str)` to robustly extract and parse JSON from AI outputs (which sometimes contain markdown formatting or unescaped characters like LaTeX backslashes) and `sanitizeQuestionForDB(q)` to ensure questions match the DB schema.
  - **Auth**: Implements an `authenticateToken` JWT middleware to protect routes. Exposes `/api/register` and `/api/login` to authenticate users, hashing passwords behind the scenes (via Mongoose hooks).
  - **User Data**: `/api/data` and `/api/profile` endpoints to fetch and persist user gamification metrics (`xp`, `streak`, `weaknessTracker`, `quizHistory`).
  - **Syllabus Upload (`/api/profile/syllabus`)**: Uses `multer` to handle file uploads. Parses text out of PDFs using `pdf-parse`, DOCX using `mammoth`, and images using `Tesseract.recognize`. The extracted text is then sent to the Groq API (using a system prompt) to automatically convert the raw syllabus into a structured JSON hierarchy mapping subjects to topics.
  - **Quiz Generation (`/api/quiz/single` & `/api/quiz`)**: Contacts the Groq API with highly structured system prompts. It injects dynamic parameters (topic, difficulty, format) and forces the AI to return questions in strict JSON format. It has a fallback mechanism to pull existing questions from MongoDB if the AI request fails or times out.
  - **AI Tutor Chat (`/api/chat`)**: Provides a Socratic tutor endpoint. It combines the user's `weaknessTracker`, `quizHistory`, and the currently active quiz question into a context block. It uses the Groq API to respond. If an image is uploaded in chat, it dynamically switches to a vision-capable model (`qwen/qwen3.6-27b`). It instructs the AI to use `[WIKI_IMAGE: ...]` tags or Mermaid.js markdown to generate diagrams.
  - **Multiplayer Arena (Socket.io)**: Manages real-time rooms. Clients emit `create-room` and `join-room`. When 2 players join, the server asks Groq to generate 5 random trivia questions, broadcasts `game-start`, and tracks/broadcasts scores dynamically as clients emit `submit-answer`.

---

## 📁 `database/` Directory
Data Models that define how data is structured in MongoDB.

### `database/User.js`
- **Purpose**: Defines the Mongoose schema for user accounts and statistics.
- **Code Explanation**:
  - Sets up the `UserSchema` with fields: `username`, `email`, `password`, `targetExam`, and gamification trackers (`xp`, `streak`, `weaknessTracker`, `microTracker`, `quizHistory`).
  - **`pre('save')` hook**: Intercepts the saving process. If the password was modified, it uses `bcrypt.genSalt` and `bcrypt.hash` to automatically salt and hash the plaintext password before committing it to the database.
  - **`comparePassword` method**: A utility attached to user instances to asynchronously compare a provided login password against the hashed password using `bcrypt.compare`.

### `database/Question.js`
- **Purpose**: Defines the Mongoose schema for caching AI-generated questions.
- **Code Explanation**:
  - `questionSchema` contains fields matching the AI JSON structure: `topic`, `subtopic`, `d` (difficulty), `type` (mcq, short, tf, sata), `q` (question), `o` (options array), `a` (correct answer), `h` (hint), and `e` (explanation).
  - Used in `server.js` as a fallback database. Successfully generated AI questions are saved here, and queried via `Question.aggregate([{ $match: ... }, { $sample: { size: 1 } }])` to provide random fallback questions.

---

## 📁 `frontend/` Directory
Client-side web application code.

### `frontend/index.html`
- **Purpose**: Structures the web application's user interface.
- **Code Explanation**: Standard HTML5 document. It outlines the semantic layout of the application: header elements, navigation tabs, dashboard container, active quiz interface elements (question text, options wrapper), and the chat container. Elements are given specific `id`s (like `quizActive`, `chatInput`) so they can be targeted by `script.js`.

### `frontend/styles.css`
- **Purpose**: Defines the visual aesthetics and layout of the application.
- **Code Explanation**: Utilizes CSS custom properties (variables) like `--bg-color`, `--text-color`, `--primary` for easy theming (e.g., toggling `.dark` class on the `<html>` element). Uses Flexbox and Grid to position elements responsively. Includes classes for animations, badge styling, and button interactions.

### `frontend/script.js`
- **Purpose**: The main client-side JavaScript that makes the application interactive.
- **Code Explanation**:
  - **State Management**: Keeps global tracking variables (`xp`, `streak`, `weaknessTracker`, `quizHistory`, `authToken`).
  - **API Fetching (`saveProgress`, etc.)**: Contains asynchronous functions wrapper over the native `fetch` API. Automatically attaches `Authorization: Bearer` headers to requests going to `/api/...`.
  - **Quiz Flow (`startQuiz`, `fetchNextQuestion`, `processAnswerResult`)**: Orchestrates the quiz. Hits the backend to fetch a question, manipulates the DOM to render the question and buttons. Validates answers on click, applying CSS classes (correct/incorrect), adjusting the dynamic difficulty for the next question, and updating the `weaknessTracker` math.
  - **MathJax & Markdown**: Uses client-side libraries `marked.parse()` and `MathJax.typesetPromise()` to render markdown and LaTeX mathematical formulas smoothly into the DOM.
  - **Chat & Web Speech Integration**: Listens to the chat input, hits the `/api/chat` endpoint, and appends HTML chat bubbles. If the AI replies with a `[WIKI_IMAGE: ...]` tag, it fires a client-side fetch request to the Wikipedia API to retrieve a thumbnail and replaces the tag with a real image. Additionally, it implements `window.SpeechRecognition` to let users speak into their microphone and `window.speechSynthesis` to read the AI's responses out loud (while stripping code blocks and image tags from the spoken text).

### `frontend/assets/` (Directory)
- **Purpose**: Stores static resources like images, logos, icons, and fonts used by the `index.html` or `styles.css`.

---

## 📁 `tests/` Directory
This directory is heavily utilized during the development phase. It contains various script files written specifically to test distinct parts of the application logic in isolation.

- **`test.js`, `my_test.js`, `my_test2.js`, `my_test3.js`, `my_test4.js`, `scratch_test.js`**: 
  - **Code Explanation**: General-purpose Node.js scratchpad scripts used to rapidly execute small blocks of JS code.
- **`test_image.js`, `test_vision.js`**: 
  - **Code Explanation**: Node.js scripts importing `tesseract.js` to run OCR tests against local images, verifying that the text extraction logic works independently of the Express server.
- **`test_pdf.js`, `test_pdf_api.js`, `test_pdf_buffer.js`, `test_pdf_fix.js`**: 
  - **Code Explanation**: Test files using the `fs` and `pdf-parse` modules to load PDF files from the local disk, parse them, and dump the text to ensure the PDF extraction algorithms are reliable.
- **`test_regex.js`**: 
  - **Code Explanation**: Contains raw JavaScript Regex literal tests to validate complex parsing logic (e.g. matching AI JSON output inside markdown blocks).
- **`test_upload.js`**: 
  - **Code Explanation**: A script that mimics an HTTP form-data upload to test the `multer` middleware limits and endpoints locally.
- **`server_test.log`**: 
  - **Code Explanation**: Not a script, but a raw text output file piping stdout/stderr from executing the test scripts above.
