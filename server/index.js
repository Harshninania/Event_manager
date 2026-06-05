import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Jimp from "jimp";
import { nanoid } from "nanoid";
import { spawnSync } from "child_process";

// SDK Imports for Production Services
import { clerkClient } from "@clerk/clerk-sdk-node";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const dataPath = path.join(__dirname, "data.json");
const uploadPath = path.join(__dirname, "uploads");
const selfiePath = path.join(uploadPath, "selfies");
const jwtSecret = process.env.JWT_SECRET || "event-media-secret";
const faceScript = path.join(__dirname, "face_match.py");

// Mock Users Database
const users = {
  admin: {
    id: "u-admin",
    username: "admin",
    password: "admin123",
    name: "Admin",
    role: "admin",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200"
  },
  photographer: {
    id: "u-photographer",
    username: "photographer",
    password: "photographer123",
    name: "Photographer",
    role: "photographer",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200"
  },
  member: {
    id: "u-member",
    username: "member",
    password: "member123",
    name: "Member",
    role: "member",
    avatar: "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200"
  },
  viewer: {
    id: "u-viewer",
    username: "viewer",
    password: "viewer123",
    name: "Visitor",
    role: "viewer",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200"
  }
};

// ----------------------------------------------------
// 1. SERVICE INITIALIZATIONS & MOCK FALLBACKS
// ----------------------------------------------------

// Clerk Integration
const isClerkEnabled = !!process.env.CLERK_SECRET_KEY;
if (isClerkEnabled) {
  console.log("Clerk Authentication integration active.");
} else {
  console.warn("CLERK_SECRET_KEY is not defined. Using local JWT authentication.");
}

// Supabase Integration
let supabase = null;
const isSupabaseEnabled = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
if (isSupabaseEnabled) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("Supabase DB client active.");
} else {
  console.warn("Supabase credentials not found. Using local JSON database fallback.");
}

// Cloudinary Storage Setup
let storage;
let isCloudinary = false;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const eventId = req.body.eventId || "general";
      const isVideo = file.mimetype.startsWith("video/");
      return {
        folder: `event-manager/${eventId}`,
        resource_type: isVideo ? "video" : "image",
        public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9]/g, "_")}`,
        transformation: [
          { quality: "auto", fetch_format: "auto" }
        ]
      };
    }
  });
  isCloudinary = true;
  console.log("Cloudinary Media Storage active.");
} else {
  storage = multer.diskStorage({
    destination: async (_req, file, cb) => {
      const destination = file.fieldname === "selfie" ? selfiePath : uploadPath;
      await fs.mkdir(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`);
    }
  });
  console.warn("Cloudinary credentials not found. Storing uploads locally.");
}
const upload = multer({ storage });

// Google Gemini Setup
let ai = null;
const isGeminiEnabled = !!process.env.GEMINI_API_KEY;
if (isGeminiEnabled) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log("Google Gemini API tagging active.");
} else {
  console.warn("GEMINI_API_KEY not found. Storing rule-based tags.");
}

// Firebase Cloud Messaging Setup
let firebaseMessaging = null;
const fcmKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, "serviceAccountKey.json");
try {
  const fileExists = await fs.access(fcmKeyPath).then(() => true).catch(() => false);
  if (fileExists) {
    const rawKey = await fs.readFile(fcmKeyPath, "utf8");
    const serviceAccount = JSON.parse(rawKey);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseMessaging = admin.messaging();
    console.log("Firebase Cloud Messaging push active.");
  } else {
    console.warn("FCM serviceAccountKey.json not found. Skipping push alerts.");
  }
} catch (err) {
  console.warn("FCM init skipped:", err.message);
}

// ----------------------------------------------------
// 2. DATA MANAGEMENT UTILITIES
// ----------------------------------------------------
const ensureData = async () => {
  try {
    await fs.access(dataPath);
  } catch {
    await fs.writeFile(dataPath, JSON.stringify({ events: [], media: [], notifications: [] }, null, 2));
  }
};

const readData = async () => {
  await ensureData();
  const raw = await fs.readFile(dataPath, "utf8");
  return JSON.parse(raw);
};

const writeData = async (data) => {
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
};

// ----------------------------------------------------
// 3. MIDDLEWARES & GENERAL FUNCTIONS
// ----------------------------------------------------
const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) {
    return next();
  }

  // Clerk Verification Mode
  if (isClerkEnabled) {
    try {
      const decoded = await clerkClient.verifyToken(token);
      const user = await clerkClient.users.getUser(decoded.sub);
      req.user = {
        id: user.id,
        name: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.username || "User",
        role: user.publicMetadata.role || "member",
        avatar: user.imageUrl || ""
      };
    } catch {
      req.user = null;
    }
    return next();
  }

  // Local JWT Mode
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
  } catch {
    req.user = null;
  }
  next();
};

const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (isClerkEnabled) {
    try {
      const decoded = await clerkClient.verifyToken(token);
      const user = await clerkClient.users.getUser(decoded.sub);
      req.user = {
        id: user.id,
        name: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.username || "User",
        role: user.publicMetadata.role || "member",
        avatar: user.imageUrl || ""
      };
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid Clerk Token." });
    }
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token." });
  }
};

const requireRole = (allowed) => async (req, res, next) => {
  await requireAuth(req, res, async () => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role permissions." });
    }
    next();
  });
};

const generateTags = (name, category) => {
  const normalized = name.toLowerCase();
  const categoryTags = {
    music: ["concert", "stage", "band"],
    sports: ["race", "athlete", "competition"],
    tech: ["conference", "startup", "innovation"],
    social: ["party", "celebration", "wedding"],
    food: ["street", "dining", "chef"],
    art: ["gallery", "design", "installation"]
  };

  const tags = new Set([category.toLowerCase(), ...((categoryTags[category.toLowerCase()] || []))]);
  if (normalized.includes("crowd")) tags.add("crowd");
  if (normalized.includes("nature")) tags.add("nature");
  if (normalized.includes("selfie")) tags.add("portrait");
  if (normalized.includes("party")) tags.add("nightlife");
  if (normalized.includes("wedding")) tags.add("romance");
  return Array.from(tags).slice(0, 6);
};

const getAITags = async (fileUrl, fileName, category) => {
  if (isGeminiEnabled && ai) {
    try {
      let base64Data;
      if (fileUrl.startsWith("http")) {
        const fetchRes = await fetch(fileUrl);
        const buffer = await fetchRes.arrayBuffer();
        base64Data = Buffer.from(buffer).toString("base64");
      } else {
        const absolutePath = path.join(__dirname, fileUrl.replace(/^\//, ""));
        const data = await fs.readFile(absolutePath);
        base64Data = data.toString("base64");
      }

      const prompt = "Analyze this photograph from a club event. Return a strict list of 4 to 8 single-word, lower-case tags describing the contents (e.g. music, stage, dancing, crowd). Separate tags only with a comma. Do not include markdown, comments, or formatting.";
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          prompt
        ]
      });

      if (response && response.text) {
        const parsed = response.text.split(",")
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0 && !t.includes(" "));
        if (parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.warn("AI tagging failed. Using fallback tagging.", err.message);
    }
  }
  return generateTags(fileName, category);
};

const parseMentions = (text) => {
  const mentionPattern = /@([A-Za-z0-9_]+)/g;
  const matches = [];
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
};

// Dispatch Notification to DB and Mobile (FCM)
const createNotification = async (data, recipient, message, link = "", type = "general") => {
  if (!recipient) {
    return;
  }

  const notification = {
    id: `n-${nanoid(6)}`,
    recipient,
    message,
    link,
    type,
    createdAt: new Date().toISOString(),
    isNew: true
  };

  // 1. Store locally or in Supabase
  if (isSupabaseEnabled && supabase) {
    try {
      await supabase.from("notifications").insert({
        recipient,
        message,
        link,
        type,
        is_new: true
      });
    } catch (err) {
      console.error("Failed to store notification in Supabase:", err.message);
    }
  } else {
    data.notifications = data.notifications || [];
    data.notifications.unshift(notification);
  }

  // 2. Dispatch FCM Push alert
  if (firebaseMessaging) {
    try {
      // In production, fetch current user FCM token
      const fcmToken = await getFCMToken(recipient);
      if (fcmToken) {
        await firebaseMessaging.send({
          notification: {
            title: `Snapshare Alert`,
            body: message
          },
          data: { link, type },
          token: fcmToken
        });
      }
    } catch (err) {
      console.warn("Failed sending FCM Push alert:", err.message);
    }
  }
};

// Helper mock to lookup user FCM tokens
const getFCMToken = async (username) => {
  if (isSupabaseEnabled && supabase) {
    const { data } = await supabase.from("user_tokens").select("fcm_token").eq("username", username).single();
    return data?.fcm_token;
  }
  return null; // Local mock returns null
};

const runFaceMatchPython = (selfieFilePath) => {
  const result = spawnSync(
    "python",
    [faceScript, selfieFilePath, uploadPath],
    { encoding: "utf8", timeout: 600000, maxBuffer: 20 * 1024 * 1024 }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || "Python face match failed.";
    throw new Error(message.trim());
  }

  const output = result.stdout.toString();
  const marker = "__FACE_MATCH_RESULT__";
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex === -1) {
    throw new Error("Face match result missing from Python output.");
  }

  const jsonPayload = output.slice(markerIndex + marker.length).trim();
  return JSON.parse(jsonPayload);
};

// ----------------------------------------------------
// 4. API ENDPOINTS
// ----------------------------------------------------

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  
  if (isClerkEnabled) {
    return res.status(400).json({ error: "Clerk is enabled. Please log in using the frontend Clerk widgets." });
  }

  const user = users[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name, avatar: user.avatar },
    jwtSecret,
    { expiresIn: "8h" }
  );

  res.json({
    user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar },
    token
  });
});

app.get("/api/events", optionalAuth, async (req, res) => {
  let events = [];
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    events = data.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      category: e.category,
      date: e.date,
      access: e.access,
      club: e.club,
      tags: e.tags,
      thumbnail: e.thumbnail
    }));
  } else {
    const data = await readData();
    events = data.events || [];
  }

  const role = req.user?.role || "viewer";
  if (role === "viewer") {
    events = events.filter((event) => event.access === "public");
  }

  const sort = req.query.sort?.toString();
  if (sort === "name") {
    events = events.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sort === "date") {
    events = events.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  if (sort === "category") {
    events = events.sort((a, b) => a.category.localeCompare(b.category));
  }

  res.json({ events });
});

app.get("/api/events/:id", optionalAuth, async (req, res) => {
  const { id } = req.params;
  let event = null;

  if (isSupabaseEnabled && supabase) {
    const { data } = await supabase.from("events").select("*").eq("id", id).single();
    if (data) {
      event = {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        date: data.date,
        access: data.access,
        club: data.club,
        tags: data.tags,
        thumbnail: data.thumbnail
      };
    }
  } else {
    const data = await readData();
    event = data.events.find((item) => item.id === id);
  }

  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }

  if (event.access === "private" && !["admin", "photographer", "member"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Access denied for private event." });
  }

  res.json({ event });
});

app.post("/api/events", requireRole(["admin", "photographer"]), async (req, res) => {
  const { name, description, category, date, access, club } = req.body;
  if (!name || !category || !date) {
    return res.status(400).json({ error: "Name, category, and date are required." });
  }

  const newEvent = {
    name,
    description,
    category,
    date,
    access: access === "private" ? "private" : "public",
    club: club || "Snapshare Club",
    tags: [category.toLowerCase()],
    thumbnail: "https://images.unsplash.com/photo-1515169067865-5387ec356754?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800"
  };

  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.from("events").insert(newEvent).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ event: data });
  } else {
    const data = await readData();
    const withId = { id: `evt-${nanoid(6)}`, ...newEvent };
    data.events.unshift(withId);
    await writeData(data);
    res.json({ event: withId });
  }
});

app.get("/api/media", optionalAuth, async (req, res) => {
  let media = [];
  let privateEventIds = new Set();

  if (isSupabaseEnabled && supabase) {
    const { data: pvEvts } = await supabase.from("events").select("id").eq("access", "private");
    if (pvEvts) pvEvts.forEach(e => privateEventIds.add(e.id));

    let query = supabase.from("media").select("*, comments(*)");
    if (req.query.eventId) {
      query = query.eq("event_id", req.query.eventId);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    media = data.map(item => ({
      id: item.id,
      eventId: item.event_id,
      title: item.title,
      mimeType: item.mime_type,
      url: item.url,
      thumbnail: item.thumbnail,
      access: item.access,
      uploader: item.uploader,
      tags: item.tags,
      likes: item.likes,
      favorites: item.favorites,
      shares: item.shares,
      taggedUsers: item.tagged_users,
      faces: item.faces,
      createdAt: item.created_at,
      isImage: item.is_image,
      comments: (item.comments || []).map(c => ({
        id: c.id,
        author: c.author,
        text: c.text,
        createdAt: c.created_at,
        mentions: c.mentions
      }))
    }));
  } else {
    const data = await readData();
    const evts = data.events || [];
    evts.filter(e => e.access === "private").forEach(e => privateEventIds.add(e.id));

    media = data.media || [];
    if (req.query.eventId) {
      media = media.filter((item) => item.eventId === req.query.eventId.toString());
    }
  }

  const role = req.user?.role || "viewer";
  const isAuthorized = ["admin", "photographer", "member"].includes(role);

  if (!isAuthorized) {
    media = media.filter((item) => item.access === "public" && !privateEventIds.has(item.eventId));
  }

  if (req.query.search) {
    const query = req.query.search.toString().toLowerCase();
    media = media.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.uploader.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  if (req.query.tag) {
    const tag = req.query.tag.toString().toLowerCase();
    media = media.filter((item) => item.tags.some((t) => t.toLowerCase() === tag));
  }

  res.json({ media });
});

app.post("/api/media/upload", requireRole(["admin", "photographer", "member"]), upload.array("mediaFiles", 20), async (req, res) => {
  const { eventId, access = "public", uploader = req.user.name } = req.body;
  let event = null;

  if (isSupabaseEnabled && supabase) {
    const { data } = await supabase.from("events").select("*").eq("id", eventId).single();
    event = data;
  } else {
    const data = await readData();
    event = data.events.find((evt) => evt.id === eventId);
  }

  if (!event) {
    return res.status(400).json({ error: "Event ID is required and must refer to a valid event." });
  }

  const createdMedia = [];
  const localDataFallback = !isSupabaseEnabled ? await readData() : null;

  for (const file of req.files) {
    const mimeType = file.mimetype;
    
    // URL depending on local/cloudinary upload
    const url = isCloudinary ? file.path : `/uploads/${file.filename}`;
    const isImage = mimeType.startsWith("image/");

    // Auto-Tagging
    const tags = await getAITags(url, file.originalname, event.category);

    const newMedia = {
      eventId,
      title: file.originalname,
      mimeType,
      url,
      thumbnail: url,
      access: access === "private" ? "private" : "public",
      uploader,
      tags,
      likes: 0,
      favorites: 0,
      shares: 0,
      taggedUsers: [],
      faces: [uploader],
      isImage
    };

    if (isSupabaseEnabled && supabase) {
      const dbItem = {
        event_id: newMedia.eventId,
        title: newMedia.title,
        mime_type: newMedia.mimeType,
        url: newMedia.url,
        thumbnail: newMedia.thumbnail,
        access: newMedia.access,
        uploader: newMedia.uploader,
        tags: newMedia.tags,
        likes: newMedia.likes,
        favorites: newMedia.favorites,
        shares: newMedia.shares,
        tagged_users: newMedia.taggedUsers,
        faces: newMedia.faces,
        is_image: newMedia.isImage
      };
      
      const { data, error } = await supabase.from("media").insert(dbItem).select().single();
      if (!error && data) {
        createdMedia.push({
          id: data.id,
          eventId: data.event_id,
          title: data.title,
          mimeType: data.mime_type,
          url: data.url,
          thumbnail: data.thumbnail,
          access: data.access,
          uploader: data.uploader,
          tags: data.tags,
          likes: data.likes,
          favorites: data.favorites,
          shares: data.shares,
          taggedUsers: data.tagged_users,
          faces: data.faces,
          createdAt: data.created_at,
          isImage: data.is_image,
          comments: []
        });
      } else {
        console.error("Supabase Media Insert Error:", error?.message);
      }
    } else {
      const withId = {
        id: `media-${nanoid(6)}`,
        ...newMedia,
        createdAt: new Date().toISOString(),
        comments: []
      };
      localDataFallback.media.unshift(withId);
      createdMedia.push(withId);
    }
  }

  if (!isSupabaseEnabled) {
    await writeData(localDataFallback);
  }

  res.json({ createdMedia });
});

app.delete("/api/media/:id", requireRole(["admin", "photographer"]), async (req, res) => {
  const { id } = req.params;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (!item) return res.status(404).json({ error: "Media not found" });

    // Clean Cloudinary media if applicable
    if (isCloudinary && item.url.includes("cloudinary.com")) {
      try {
        const publicId = item.url.split("/").slice(-2).join("/").split(".")[0];
        const resourceType = item.mime_type.startsWith("video/") ? "video" : "image";
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      } catch (err) {
        console.warn("Could not delete file from Cloudinary:", err.message);
      }
    }

    const { error } = await supabase.from("media").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, id });
  }

  const data = await readData();
  const mediaIndex = data.media.findIndex((item) => item.id === id);

  if (mediaIndex === -1) {
    return res.status(404).json({ error: "Media not found." });
  }

  const mediaItem = data.media[mediaIndex];
  if (mediaItem.url.startsWith("/uploads/")) {
    const filePath = path.join(__dirname, mediaItem.url.replace("/uploads/", ""));
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore missing files
    }
  }

  data.media.splice(mediaIndex, 1);
  await writeData(data);
  res.json({ success: true, id });
});

app.get("/api/search", optionalAuth, async (req, res) => {
  const query = req.query.query?.toString().trim().toLowerCase() || "";
  const role = req.user?.role || "viewer";
  const isAuthorized = ["admin", "photographer", "member"].includes(role);
  let privateEventIds = new Set();

  if (isSupabaseEnabled && supabase) {
    const { data: pvEvts } = await supabase.from("events").select("id").eq("access", "private");
    if (pvEvts) pvEvts.forEach(e => privateEventIds.add(e.id));

    let mediaQuery = supabase.from("media").select("*, comments(*)");
    let eventQuery = supabase.from("events").select("*");
    
    const { data: dbEvents } = await eventQuery;
    const { data: dbMedia } = await mediaQuery;

    let events = dbEvents || [];
    let media = dbMedia || [];

    if (!isAuthorized) {
      events = events.filter((e) => e.access === "public");
      media = media.filter((m) => m.access === "public" && !privateEventIds.has(m.event_id));
    }

    if (query) {
      events = events.filter(e =>
        e.name.toLowerCase().includes(query) ||
        (e.description && e.description.toLowerCase().includes(query)) ||
        e.tags.some(tag => tag.toLowerCase().includes(query))
      );
      media = media.filter(item =>
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.uploader && item.uploader.toLowerCase().includes(query)) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    const mediaList = media.map(item => ({
      id: item.id,
      eventId: item.event_id,
      title: item.title,
      mimeType: item.mime_type,
      url: item.url,
      thumbnail: item.thumbnail,
      access: item.access,
      uploader: item.uploader,
      tags: item.tags,
      likes: item.likes,
      favorites: item.favorites,
      shares: item.shares,
      taggedUsers: item.tagged_users,
      faces: item.faces,
      createdAt: item.created_at,
      isImage: item.is_image,
      comments: (item.comments || []).map(c => ({
        id: c.id,
        author: c.author,
        text: c.text,
        createdAt: c.created_at,
        mentions: c.mentions
      }))
    }));

    return res.json({ results: { events, media: mediaList } });
  }

  const data = await readData();
  const evts = data.events || [];
  evts.filter(e => e.access === "private").forEach(e => privateEventIds.add(e.id));

  let events = data.events || [];
  let media = data.media || [];

  if (!isAuthorized) {
    events = events.filter((event) => event.access === "public");
    media = media.filter((item) => item.access === "public" && !privateEventIds.has(item.eventId));
  }

  if (query) {
    events = events.filter((event) =>
      event.name.toLowerCase().includes(query) ||
      event.description.toLowerCase().includes(query) ||
      event.tags.some((tag) => tag.toLowerCase().includes(query))
    );
    media = media.filter((item) =>
      item.title.toLowerCase().includes(query) ||
      item.uploader.toLowerCase().includes(query) ||
      item.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  res.json({ results: { events, media } });
});

app.post("/api/face-match", optionalAuth, upload.single("selfie"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "A selfie file is required for face matching." });
  }

  // Handle local / Cloudinary source file paths
  const selfieFilePath = isCloudinary ? req.file.path : path.join(req.file.destination, req.file.filename);

  try {
    // If running in local storage, we can execute the face match script
    if (!isCloudinary) {
      const result = runFaceMatchPython(selfieFilePath);
      const matchedMedia = (result.matches || [])
        .filter((match) => match.path && match.path.startsWith(uploadPath))
        .map((match) => ({
          path: match.path,
          distance: match.distance,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12);

      const data = await readData();
      const mediaMap = new Map(
        data.media.map((item) => [
          path.normalize(path.join(__dirname, item.url.replace(/^\//, ""))),
          item,
        ])
      );

      const matches = matchedMedia
        .map((match) => {
          const absolutePath = path.normalize(match.path);
          const item = mediaMap.get(absolutePath);
          if (!item) return null;
          return { ...item, similarity: match.distance };
        })
        .filter(Boolean);

      return res.json({ matches });
    }

    // Cloudinary Mode Face Match:
    // If they choose client-side browser matching, this endpoint is a simple fallback that returns empty matches
    // since the frontend App.tsx handles comparing face descriptors using face-api.js.
    return res.json({ matches: [], note: "Please execute client-side face recognition." });
  } catch (error) {
    console.error("Face-match error:", error);
    return res.status(500).json({ error: "Face recognition failed." });
  }
});

app.get("/api/notifications", optionalAuth, async (req, res) => {
  let notifications = [];
  if (isSupabaseEnabled && supabase) {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
    notifications = (data || []).map(n => ({
      id: n.id,
      recipient: n.recipient,
      message: n.message,
      link: n.link,
      type: n.type,
      createdAt: n.created_at,
      isNew: n.is_new
    }));
  } else {
    const data = await readData();
    notifications = data.notifications || [];
  }

  if (!req.user?.name) {
    return res.json({ notifications: notifications.filter((note) => note.recipient === "all") });
  }
  const filtered = notifications.filter((note) => note.recipient === "all" || note.recipient === req.user.name);
  res.json({ notifications: filtered });
});

app.post("/api/media/:id/share", requireAuth, async (req, res) => {
  const { id } = req.params;
  let media = null;
  const data = !isSupabaseEnabled ? await readData() : null;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (item) {
      const updatedShares = (item.shares || 0) + 1;
      const { data: updated } = await supabase.from("media").update({ shares: updatedShares }).eq("id", id).select().single();
      media = { ...updated, eventId: updated.event_id, uploader: updated.uploader };
    }
  } else {
    media = data.media.find((item) => item.id === id);
    if (media) {
      media.shares = (media.shares || 0) + 1;
    }
  }

  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  if (media.uploader !== req.user.name) {
    await createNotification(data, media.uploader, `${req.user.name} shared your photo.`, `/api/media/${id}`, "share");
  }

  if (!isSupabaseEnabled) {
    await writeData(data);
  }

  res.json({ shares: media.shares });
});

app.post("/api/media/:id/tag", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { taggedUser, taggedUsers } = req.body;
  const usersToTag = [];

  if (typeof taggedUser === "string" && taggedUser.trim()) {
    usersToTag.push(taggedUser.trim());
  }
  if (Array.isArray(taggedUsers)) {
    taggedUsers.forEach((name) => {
      if (typeof name === "string" && name.trim()) {
        usersToTag.push(name.trim());
      }
    });
  }

  if (usersToTag.length === 0) {
    return res.status(400).json({ error: "At least one user must be tagged." });
  }

  let media = null;
  const data = !isSupabaseEnabled ? await readData() : null;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (item) {
      const currentTags = item.tagged_users || [];
      const updatedTags = [...new Set([...currentTags, ...usersToTag])];
      const { data: updated } = await supabase.from("media").update({ tagged_users: updatedTags }).eq("id", id).select().single();
      media = { ...updated, taggedUsers: updated.tagged_users, uploader: updated.uploader };
    }
  } else {
    media = data.media.find((item) => item.id === id);
    if (media) {
      media.taggedUsers = media.taggedUsers || [];
      usersToTag.forEach((name) => {
        if (!media.taggedUsers.includes(name)) {
          media.taggedUsers.push(name);
        }
      });
    }
  }

  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  for (const name of usersToTag) {
    if (name !== req.user.name) {
      await createNotification(data, name, `${req.user.name} tagged you in a photo.`, `/api/media/${id}`, "tag");
    }
  }

  if (!isSupabaseEnabled) {
    await writeData(data);
  }

  res.json({ taggedUsers: media.taggedUsers });
});

app.get("/api/media/:id/download", optionalAuth, async (req, res) => {
  const { id } = req.params;
  const watermark = req.query.watermark === "true";
  let item = null;

  if (isSupabaseEnabled && supabase) {
    const { data: dbItem } = await supabase.from("media").select("*").eq("id", id).single();
    if (dbItem) {
      item = {
        id: dbItem.id,
        eventId: dbItem.event_id,
        title: dbItem.title,
        mimeType: dbItem.mime_type,
        url: dbItem.url,
        thumbnail: dbItem.thumbnail,
        access: dbItem.access,
        uploader: dbItem.uploader,
        tags: dbItem.tags,
        isImage: dbItem.is_image
      };
    }
  } else {
    const data = await readData();
    item = data.media.find((media) => media.id === id);
  }

  if (!item) {
    return res.status(404).json({ error: "Media item not found." });
  }

  // Get event access
  let isEventPrivate = false;
  if (isSupabaseEnabled && supabase) {
    const { data: evt } = await supabase.from("events").select("access").eq("id", item.eventId).single();
    if (evt && evt.access === "private") isEventPrivate = true;
  } else {
    const data = await readData();
    const evt = data.events.find(e => e.id === item.eventId);
    if (evt && evt.access === "private") isEventPrivate = true;
  }

  const isPrivate = item.access === "private" || isEventPrivate;
  const isAuthorized = ["admin", "photographer", "member"].includes(req.user?.role);

  if (isPrivate && !isAuthorized) {
    return res.status(403).json({ error: "Access denied." });
  }

  if (watermark && item.isImage) {
    // If media is in Cloudinary, perform on-the-fly watermark overlays
    if (isCloudinary && item.url.includes("cloudinary.com")) {
      // Transformation format: l_text:Arial_24_bold:{encoded_text},co_white,g_south_west,x_20,y_20
      const textOverlay = `l_text:Arial_22_bold:${encodeURIComponent(item.uploader)},co_white,g_south_west,x_20,y_20`;
      const watermarkedUrl = item.url.replace("/upload/", `/upload/${textOverlay}/`);
      return res.redirect(watermarkedUrl);
    }

    // Local Jimp image watermark generation fallback
    try {
      const source = item.url.startsWith("http") ? item.url : path.join(__dirname, item.url.replace(/^\//, ""));
      const image = await Jimp.read(source);
      const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
      const text = `${item.uploader} · ${item.tags.slice(0, 4).join(", ")}`;
      image.print(font, 16, image.getHeight() - 32, text);
      const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
      res.set("Content-Type", "image/jpeg");
      return res.send(buffer);
    } catch (error) {
      console.warn("Watermark generation failed", error);
    }
  }

  if (item.url.startsWith("http")) {
    return res.redirect(item.url);
  }

  return res.sendFile(path.join(__dirname, item.url.replace(/^\//, "")));
});

app.post("/api/media/:id/like", requireAuth, async (req, res) => {
  const { id } = req.params;
  let media = null;
  const data = !isSupabaseEnabled ? await readData() : null;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (item) {
      const updatedLikes = (item.likes || 0) + 1;
      const { data: updated } = await supabase.from("media").update({ likes: updatedLikes }).eq("id", id).select().single();
      media = { ...updated, eventId: updated.event_id, uploader: updated.uploader };
    }
  } else {
    media = data.media.find((item) => item.id === id);
    if (media) {
      media.likes = (media.likes || 0) + 1;
    }
  }

  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  if (media.uploader !== req.user.name) {
    await createNotification(data, media.uploader, `${req.user.name} liked your photo.`, `/api/media/${id}`, "like");
  }

  if (!isSupabaseEnabled) {
    await writeData(data);
  }

  res.json({ likes: media.likes });
});

app.post("/api/media/:id/comment", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Comment text is required." });
  }

  const mentions = parseMentions(text);
  const comment = {
    id: `c-${nanoid(6)}`,
    author: req.user.name,
    text,
    mentions,
    createdAt: new Date().toISOString()
  };

  let media = null;
  const data = !isSupabaseEnabled ? await readData() : null;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (item) {
      const { data: insertedComment, error } = await supabase.from("comments").insert({
        media_id: id,
        author: req.user.name,
        text,
        mentions
      }).select().single();
      
      if (!error && insertedComment) {
        comment.id = insertedComment.id;
        comment.createdAt = insertedComment.created_at;
        media = { ...item, uploader: item.uploader };
      }
    }
  } else {
    media = data.media.find((item) => item.id === id);
    if (media) {
      media.comments = media.comments || [];
      media.comments.unshift(comment);
    }
  }

  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  if (media.uploader !== req.user.name) {
    await createNotification(data, media.uploader, `${req.user.name} commented on your upload.`, `/api/media/${id}`, "comment");
  }

  for (const name of mentions) {
    if (name !== media.uploader) {
      await createNotification(data, name, `${req.user.name} mentioned you in a comment.`, `/api/media/${id}`, "mention");
    }
  }

  if (!isSupabaseEnabled) {
    await writeData(data);
  }

  res.json({ comment });
});

app.post("/api/media/:id/favorite", requireAuth, async (req, res) => {
  const { id } = req.params;
  let media = null;
  const data = !isSupabaseEnabled ? await readData() : null;

  if (isSupabaseEnabled && supabase) {
    const { data: item } = await supabase.from("media").select("*").eq("id", id).single();
    if (item) {
      const updatedFavs = (item.favorites || 0) + 1;
      const { data: updated } = await supabase.from("media").update({ favorites: updatedFavs }).eq("id", id).select().single();
      media = { ...updated, eventId: updated.event_id, uploader: updated.uploader };
    }
  } else {
    media = data.media.find((item) => item.id === id);
    if (media) {
      media.favorites = (media.favorites || 0) + 1;
    }
  }

  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  if (media.uploader !== req.user.name) {
    await createNotification(data, media.uploader, `${req.user.name} favorited your photo.`, `/api/media/${id}`, "favorite");
  }

  if (!isSupabaseEnabled) {
    await writeData(data);
  }

  res.json({ favorites: media.favorites });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Event & Media API server running on http://localhost:${port}`);
});
