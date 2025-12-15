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
// 🧠 0) ESTADO DE CONVERSACIÓN (MVP EN MEMORIA)
// =====================================================
// Nota: esto se reinicia si Railway redeploya/reinicia.
// Mañana lo pasamos a Postgres para publicar ya pro.
const userState = new Map(); // key: from, value: { step, data, updatedAt }

function getState(from) {
  if (!userState.has(from)) {
    userState.set(from, { step: "START", data: {}, updatedAt: Date.now() });
  }
  return userState.get(from);
}

function setStep(from, step) {
  const s = getState(from);
  s.step = step;
  s.updatedAt = Date.now();
  userState.set(from, s);
}

function updateData(from, patch) {
  const s = getState(from);
  s.data = { ...s.data, ...patch };
  s.updatedAt = Date.now();
  userState.set(from, s);
}

function normalizeText(t = "") {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isYes(text) {
  const t = normalizeText(text);
  return ["si", "sí", "simon", "simón", "va", "dale", "ok", "yes", "jalo", "jalo"].some(
    (w) => t.includes(normalizeText(w))
  );
}

function isNo(text) {
  const t = normalizeText(text);
  return ["no", "nel", "nelson", "nop", "nope"].some((w) => t.includes(normalizeText(w)));
}

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

// (Opcional pero útil)
app.get("/health", (_req, res) => res.status(200).send("ok"));

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
  // Meta necesita 200 rápido
  res.sendStatus(200);

  try {
    const body = req.body;

    // Log resumido (evita spam enorme)
    console.log("📩 POST Webhook recibido");

    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const type = message.type;

    // Solo texto por ahora
    if (type !== "text") {
      await sendWhatsAppMessage(from, "Aún solo entiendo texto 🙈. Escríbeme y le damos 😄");
      return;
    }

    const rawText = message.text?.body || "";
    const text = normalizeText(rawText);
    console.log(`💬 Mensaje de ${from}: ${rawText}`);

    const state = getState(from);

    // ✅ Si el usuario pone "reiniciar" en cualquier momento
    if (text.includes("reiniciar") || text.includes("reset")) {
      setStep(from, "START");
      await sendWhatsAppMessage(from, "Listo 😄 Reiniciamos. Pon “hola” y arrancamos de nuevo 🎁");
      return;
    }

    // =====================================================
    // 🎁 FLUJO MVP CON ESTADO (LO QUE TE FALTABA)
    // =====================================================

    // Paso START: primera interacción
    if (state.step === "START") {
      await sendWhatsAppMessage(
        from,
        "Qué onda 👋 soy Regalito Bot 🎁\nSoy tu compa para ayudarte a encontrar el regalo ideal.\n\n¿Quieres encontrar tu regalo ideal? 😄\n👉 Sí / No"
      );
      setStep(from, "WAITING_SELF_DECISION");
      return;
    }

    // Respuesta a Sí/No para regalo propio
    if (state.step === "WAITING_SELF_DECISION") {
      if (isYes(text)) {
        await sendWhatsAppMessage(
          from,
          "Va 😎 Entonces este primer regalo es para ti.\n\n¿Cómo te gustaría sentir con ese regalo? 👀\n(apapachado, sorprendido, motivado, consentido…)"
        );
        setStep(from, "ASK_FEELING");
        return;
      }

      if (isNo(text)) {
        await sendWhatsAppMessage(
          from,
          "Todo bien 😌\nEntonces dime… ¿quieres encontrar un regalo para alguien más? 🎁\n👉 Sí / No"
        );
        setStep(from, "WAITING_OTHER_DECISION");
        return;
      }

      await sendWhatsAppMessage(from, "Te leo 👀\nSolo dime: 👉 Sí / No");
      return;
    }

    // Respuesta a Sí/No para regalo a alguien más
    if (state.step === "WAITING_OTHER_DECISION") {
      if (isYes(text)) {
        await sendWhatsAppMessage(
          from,
          "Va 👌\n¿Para quién es el regalo? (pareja, familia, amigo, compa del trabajo, quien sea) 🎁"
        );
        setStep(from, "ASK_FOR_WHO");
        return;
      }

      if (isNo(text)) {
        await sendWhatsAppMessage(
          from,
          "Va 😄 Cuando se te antoje, aquí ando.\nPon “hola” y arrancamos 🎁"
        );
        setStep(from, "START");
        return;
      }

      await sendWhatsAppMessage(from, "Dime: 👉 Sí / No 😄");
      return;
    }

    // Captura feeling (regalo para sí mismo)
    if (state.step === "ASK_FEELING") {
      updateData(from, { feeling: rawText });

      await sendWhatsAppMessage(
        from,
        "Ufff, ya entendí el mood 😏\n\n¿Más o menos qué presupuesto traes?\n1) Muy accesible\n2) Algo bien\n3) Me quiero lucir 😎\n4) Sorpréndeme"
      );
      setStep(from, "ASK_BUDGET_SELF");
      return;
    }

    // Presupuesto para sí mismo (entrega recomendación placeholder)
    if (state.step === "ASK_BUDGET_SELF") {
      updateData(from, { budget: rawText });

      const s = getState(from);
      const feeling = s.data.feeling || "bien";
      const budget = s.data.budget || "lo que se pueda";

      await sendWhatsAppMessage(
        from,
        `Va 🔥\nMe dijiste que quieres sentirte: *${feeling}*.\nY tu presupuesto: *${budget}*.\n\n🎁 Idea rápida (modo compa-experto):\nUn detalle que te apapache hoy: tu antojo favorito + algo para tu ritual (vela, té/café, libreta o playlist) 😌\n\nEste regalo dice: *me cuido y me celebro*.\n\n¿Quieres otra idea? 👀 (sí/no)`
      );

      // Puedes mandar a un paso POST_RECO si quieres seguir, por ahora reiniciamos.
      setStep(from, "START");
      return;
    }

    // Captura "para quién" (regalo a otro)
    if (state.step === "ASK_FOR_WHO") {
      updateData(from, { who: rawText });

      await sendWhatsAppMessage(
        from,
        "Va 👀\n¿Y por qué quieres regalarle algo?\n- porque pensé en esa persona\n- porque la quiero\n- porque quiero sorprender\n- porque sí 😌\n\nRespóndeme como tú quieras."
      );
      setStep(from, "ASK_REASON");
      return;
    }

    // Captura motivo
    if (state.step === "ASK_REASON") {
      updateData(from, { reason: rawText });

      await sendWhatsAppMessage(
        from,
        "Nice 😏\nAhora sí, ¿qué presupuesto traes?\n1) Muy accesible\n2) Algo bien\n3) Me quiero lucir 😎\n4) Sorpréndeme"
      );
      setStep(from, "ASK_BUDGET_OTHER");
      return;
    }

    // Presupuesto para otro (entrega recomendación placeholder)
    if (state.step === "ASK_BUDGET_OTHER") {
      updateData(from, { budget: rawText });

      const s = getState(from);
      const who = s.data.who || "esa persona";
      const reason = s.data.reason || "porque sí";
      const budget = s.data.budget || "lo que se pueda";

      await sendWhatsAppMessage(
        from,
        `Ok 😎\nPara: *${who}*\nMotivo: *${reason}*\nPresupuesto: *${budget}*\n\n🎁 Idea rápida:\nAlgo que diga “pensé en ti”: un detalle personalizado (nota escrita, foto, llaverito o taza) + un gusto de esa persona (snack, cafecito, algo que use diario).\n\nSi me dices qué le gusta (música/series/hobbies), te lo afino y le atinamos más 👀`
      );

      setStep(from, "START");
      return;
    }

    // Fallback
    await sendWhatsAppMessage(from, "Me perdí tantito 🙈 Pon “hola” y reiniciamos chido 😄");
    setStep(from, "START");
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
