# 🚀 P2P File Transfer Frontend (Next.js)  

This is the frontend of the **P2P File Transfer** project built using **Next.js 13**. It allows users to send and receive files seamlessly over WebSockets with a Rust-based **Axum** backend.  

## 🔥 Features  
✅ Next.js 13 with App Router  
✅ WebSockets for real-time communication  
✅ Peer-to-peer (P2P) file transfer  
✅ Supports large file transfers  
✅ Minimal UI with smooth UX  

## 🛠️ Technologies Used  
- **Next.js 13** (Frontend framework)  
- **React Hooks** (State management)  
- **WebSockets** (Real-time file transfer)  
- **TypeScript** (Ensuring type safety)  


### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Run the Project
```bash
npm run dev
```
Your frontend should now be running at http://localhost:3000 🚀

📂 Project Structure
```bash
/p2p-file-transfer-frontend
│── /app
│   ├── /send  # Sender logic
│   ├── /receive  # Receiver logic
│── /components  # Reusable UI components
│── /utils  # Utility functions
│── /public  # Static assets
│── package.json  # Dependencies & scripts
│── README.md  # Project documentation
```

## 🚀 Backend Integration
This frontend is designed to work with the Rust (Axum) WebSocket server. Make sure your backend is running before testing.

