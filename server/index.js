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

const storage = multer.diskStorage({
  destination: async (_req, file, cb) => {
    const destination = file.fieldname === "selfie" ? selfiePath : uploadPath;
    await fs.mkdir(destination, { recursive: true });
    cb(null, destination);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`);
  }
});
const upload = multer({ storage });

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

const normalizeMatchUrl = (matchPath) => {
  const normalizedPath = path.normalize(matchPath);
  const relativePath = path.relative(__dirname, normalizedPath).replace(/\\/g, "/");
  return `/${relativePath}`.replace(/\/+/g, "/");
};

const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) {
    return next();
  }

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

const parseMentions = (text) => {
  const mentionPattern = /@([A-Za-z0-9_]+)/g;
  const matches = [];
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
};

const createNotification = (data, recipient, message, link = "", type = "general") => {
  if (!recipient) {
    return;
  }
  data.notifications = data.notifications || [];
  data.notifications.unshift({
    id: `n-${nanoid(6)}`,
    recipient,
    message,
    link,
    type,
    createdAt: new Date().toISOString(),
    isNew: true
  });
};

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
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
  const data = await readData();
  let events = data.events || [];

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
  const data = await readData();
  const event = data.events.find((item) => item.id === id);
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

  const data = await readData();
  const newEvent = {
    id: `evt-${nanoid(6)}`,
    name,
    description,
    category,
    date,
    access: access === "private" ? "private" : "public",
    club: club || "Snapshare Club",
    tags: [category.toLowerCase()],
    thumbnail: "https://images.unsplash.com/photo-1515169067865-5387ec356754?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800"
  };

  data.events.unshift(newEvent);
  await writeData(data);
  res.json({ event: newEvent });
});

app.get("/api/media", optionalAuth, async (req, res) => {
  const data = await readData();
  let media = data.media || [];
  const role = req.user?.role || "viewer";

  if (role === "viewer") {
    media = media.filter((item) => item.access === "public");
  }

  if (req.query.eventId) {
    media = media.filter((item) => item.eventId === req.query.eventId.toString());
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
  const data = await readData();
  const { eventId, access = "public", uploader = req.user.name } = req.body;
  const event = data.events.find((evt) => evt.id === eventId);

  if (!event) {
    return res.status(400).json({ error: "Event ID is required." });
  }

  const createdMedia = [];
  for (const file of req.files) {
    const mimeType = file.mimetype;
    const url = `/uploads/${file.filename}`;
    const isImage = mimeType.startsWith("image/");
    const newMedia = {
      id: `media-${nanoid(6)}`,
      eventId,
      title: file.originalname,
      mimeType,
      url,
      thumbnail: url,
      access: access === "private" ? "private" : "public",
      uploader,
      tags: generateTags(file.originalname, event.category),
      likes: 0,
      favorites: 0,
      shares: 0,
      taggedUsers: [],
      comments: [],
      faces: [uploader],
      createdAt: new Date().toISOString(),
      isImage
    };

    data.media.unshift(newMedia);
    createdMedia.push(newMedia);
  }

  await writeData(data);
  res.json({ createdMedia });
});

app.delete("/api/media/:id", requireRole(["admin", "photographer"]), async (req, res) => {
  const { id } = req.params;
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
  const data = await readData();
  const role = req.user?.role || "viewer";

  let events = data.events || [];
  let media = data.media || [];

  if (role === "viewer") {
    events = events.filter((event) => event.access === "public");
    media = media.filter((item) => item.access === "public");
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

  const selfieFilePath = path.join(req.file.destination, req.file.filename);

  try {
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
        if (!item) {
          return null;
        }
        return { ...item, similarity: match.distance };
      })
      .filter(Boolean);

    return res.json({ matches });
  } catch (error) {
    console.error("Face-match error:", error);
    return res.status(500).json({ error: "Face recognition failed." });
  }
});

app.get("/api/notifications", optionalAuth, async (req, res) => {
  const data = await readData();
  const notifications = data.notifications || [];
  if (!req.user?.name) {
    return res.json({ notifications: notifications.filter((note) => note.recipient === "all") });
  }
  const filtered = notifications.filter((note) => note.recipient === "all" || note.recipient === req.user.name);
  res.json({ notifications: filtered });
});

app.post("/api/media/:id/share", requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const media = data.media.find((item) => item.id === id);
  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }
  media.shares = (media.shares || 0) + 1;
  if (media.uploader !== req.user.name) {
    createNotification(data, media.uploader, `${req.user.name} shared your photo.`, `/api/media/${id}`, "share");
  }
  await writeData(data);
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

  const data = await readData();
  const media = data.media.find((item) => item.id === id);
  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  media.taggedUsers = media.taggedUsers || [];
  usersToTag.forEach((name) => {
    if (!media.taggedUsers.includes(name)) {
      media.taggedUsers.push(name);
      if (name !== req.user.name) {
        createNotification(data, name, `${req.user.name} tagged you in a photo.`, `/api/media/${id}`, "tag");
      }
    }
  });
  await writeData(data);
  res.json({ taggedUsers: media.taggedUsers });
});

app.get("/api/media/:id/download", optionalAuth, async (req, res) => {
  const { id } = req.params;
  const watermark = req.query.watermark === "true";

  const data = await readData();
  const item = data.media.find((media) => media.id === id);
  if (!item) {
    return res.status(404).json({ error: "Media item not found." });
  }

  if (item.access === "private" && !["admin", "photographer", "member"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Access denied." });
  }

  if (watermark && item.mimeType.startsWith("image/")) {
    try {
      const source = item.url.startsWith("http") ? item.url : path.join(__dirname, item.url);
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

  return res.sendFile(path.join(__dirname, item.url));
});

app.post("/api/media/:id/like", requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const media = data.media.find((item) => item.id === id);
  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  media.likes = (media.likes || 0) + 1;
  if (media.uploader !== req.user.name) {
    createNotification(data, media.uploader, `${req.user.name} liked your photo.`, `/api/media/${id}`, "like");
  }
  await writeData(data);
  res.json({ likes: media.likes });
});

app.post("/api/media/:id/comment", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Comment text is required." });
  }

  const data = await readData();
  const media = data.media.find((item) => item.id === id);
  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  const mentions = parseMentions(text);
  const comment = {
    id: `c-${nanoid(6)}`,
    author: req.user.name,
    text,
    mentions,
    createdAt: new Date().toISOString()
  };

  media.comments = media.comments || [];
  media.comments.unshift(comment);

  if (media.uploader !== req.user.name) {
    createNotification(data, media.uploader, `${req.user.name} commented on your upload.`, `/api/media/${id}`, "comment");
  }

  mentions.forEach((name) => {
    if (name !== media.uploader) {
      createNotification(data, name, `${req.user.name} mentioned you in a comment.`, `/api/media/${id}`, "mention");
    }
  });

  await writeData(data);
  res.json({ comment });
});

app.post("/api/media/:id/favorite", requireAuth, async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const media = data.media.find((item) => item.id === id);
  if (!media) {
    return res.status(404).json({ error: "Media item not found." });
  }

  media.favorites = (media.favorites || 0) + 1;
  if (media.uploader !== req.user.name) {
    createNotification(data, media.uploader, `${req.user.name} favorited your photo.`, `/api/media/${id}`, "favorite");
  }
  await writeData(data);
  res.json({ favorites: media.favorites });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Event & Media API server running on http://localhost:${port}`);
});
