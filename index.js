require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 👉 Traemos las variables del .env
const { PORT = 3000, VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;

// =====================================================
// 1️⃣  VERIFICACIÓN DEL WEBHOOK (GET)
// =====================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🟦 Verificación GET recibida:", { mode, token, challenge });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("🟩 Webhook verificado correctamente");
    return res.status(200).send(challenge);
  } else {
    console.log("🟥 Error de verificación, token incorrecto");
    return res.sendStatus(403);
  }
});

// =====================================================
// 2️⃣  RECEPCIÓN DE MENSAJES (POST)
// =====================================================
app.post("/webhook", (req, res) => {
  console.log("📩 POST Webhook:", JSON.stringify(req.body, null, 2));

  // Meta solo necesita un 200 para no reenviar el evento
  res.sendStatus(200);

  // Aquí después procesaremos el mensaje para el bot
});

// =====================================================
// 3️⃣  INICIAR SERVIDOR
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
