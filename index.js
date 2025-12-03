require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 👉 Variables de entorno
const {
  PORT = 3000,
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION = "v24.0",
} = process.env;

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
// 2️⃣  FUNCIÓN PARA ENVIAR MENSAJES POR WHATSAPP
// =====================================================
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("📤 Mensaje enviado:", resp.data);
  } catch (error) {
    console.error("❌ Error al enviar mensaje:", error.response?.data || error.message);
  }
}

// =====================================================
// 3️⃣  RECEPCIÓN DE MENSAJES (POST)
// =====================================================
app.post("/webhook", async (req, res) => {
  console.log("📩 POST Webhook:", JSON.stringify(req.body, null, 2));

  // Meta necesita 200 rápido
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return;

    const from = message.from; // número del usuario
    const type = message.type;

    // Solo texto por ahora
    if (type === "text") {
      const text = message.text.body;
      console.log(`💬 Mensaje de ${from}: ${text}`);

      // Respuesta básica
      let reply = "Hola, soy el bot Regalito 🤖🎁";

      if (/hola|buenas/i.test(text)) {
        reply =
          "¡Hola! 👋 Soy Regalito Bot. Puedo ayudarte a elegir un regalo chido. Cuéntame: ¿para quién es el regalo y para qué ocasión?";
      } else if (/gracias/i.test(text)) {
        reply = "De nada, MauBot te ama 💚";
      } else {
        reply =
          "Recibí tu mensaje 🤓. Pronto podré sugerirte regalos. Por ahora dime: ¿para quién es el regalo? (pareja, amigo, familia…)";
      }

      await sendWhatsAppMessage(from, reply);
    }
  } catch (err) {
    console.error("⚠️ Error procesando webhook:", err);
  }
});

// =====================================================
// 4️⃣  INICIAR SERVIDOR
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
