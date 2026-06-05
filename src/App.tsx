import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import {
  Aperture,
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Image,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Role = "admin" | "photographer" | "member" | "viewer";

type EventItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  date: string;
  access: string;
  club: string;
  tags: string[];
  thumbnail: string;
};

type MediaItem = {
  id: string;
  eventId: string;
  title: string;
  mimeType: string;
  url: string;
  thumbnail: string;
  access: string;
  uploader: string;
  tags: string[];
  likes: number;
  favorites: number;
  shares?: number;
  taggedUsers?: string[];
  comments: Array<{ id: string; author: string; text: string; createdAt: string; mentions?: string[] }>;
  faces: string[];
  createdAt: string;
  isImage: boolean;
};

type Notification = {
  id: string;
  recipient: string;
  message: string;
  link?: string;
  type: string;
  createdAt: string;
  isNew: boolean;
};

type User = {
  id: string;
  name: string;
  role: Role;
  avatar: string;
};

const defaultEventForm = {
  name: "",
  description: "",
  category: "Music",
  date: "",
  access: "public",
  club: "Snapshare Club",
};

export default function App() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<null | { events: EventItem[]; media: MediaItem[] }>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadWarnings, setUploadWarnings] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [albumPanelOpen, setAlbumPanelOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [faceMatches, setFaceMatches] = useState<MediaItem[]>([]);
  const [activeView, setActiveView] = useState<"events" | "albums" | "upload" | "discover" | "settings">("events");
  const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
  const [isLoadingAllMedia, setIsLoadingAllMedia] = useState(false);
  const [isFaceSearching, setIsFaceSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [eventForm, setEventForm] = useState(defaultEventForm);
  const [user, setUser] = useState<User>({
    id: "guest",
    name: "Visitor",
    role: "viewer",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
  });
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isViewer = user.role === "viewer";
  const canUpload = user.role !== "viewer";
  const canCreateEvent = ["admin", "photographer"].includes(user.role);
  const canDeleteMedia = ["admin", "photographer"].includes(user.role);

  useEffect(() => {
    fetchEvents("date");
    loginAs("viewer");
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});

  const loginAs = async (role: Role) => {
    if (role === "viewer") {
      setUser({
        id: "guest",
        name: "Visitor",
        role: "viewer",
        avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
      });
      setToken(null);
      return;
    }

    try {
      const response = await axios.post("/api/auth/login", {
        username: role,
        password: `${role}123`,
      });

      setToken(response.data.token);
      setUser(response.data.user);
      setMessage(null);
    } catch {
      setMessage("Unable to log in for that role.");
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setMessage(null);

    try {
      const response = await axios.post("/api/auth/login", {
        username: username.trim(),
        password,
      });

      setToken(response.data.token);
      setUser(response.data.user);
      setPassword("");
      setMessage(`Signed in as ${response.data.user.role}.`);
    } catch (error) {
      setMessage("Invalid username or password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    loginAs("viewer");
    setUsername("admin");
    setPassword("");
    setMessage("Logged out.");
  };

  const fetchNotifications = async () => {
    if (!token) {
      setNotifications([]);
      return;
    }

    try {
      const response = await axios.get("/api/notifications", {
        headers: authHeaders(),
      });
      setNotifications(response.data.notifications || []);
    } catch {
      setMessage("Unable to load notifications.");
    }
  };

  const handleNotificationToggle = () => {
    setNotifOpen((current) => !current);
    if (!notifOpen) {
      fetchNotifications();
    }
  };

  const newNotificationCount = notifications.filter((note) => note.isNew).length;

  const fetchEvents = async (sort = "date") => {
    try {
      const response = await axios.get("/api/events", {
        params: { sort },
        headers: authHeaders(),
      });
      setEvents(response.data.events || []);
    } catch {
      setMessage("Unable to load events.");
    }
  };

  const fetchAllMedia = async () => {
    setIsLoadingAllMedia(true);
    try {
      const response = await axios.get("/api/media", {
        headers: authHeaders(),
      });
      setAllMedia(response.data.media || []);
    } catch {
      setMessage("Unable to load albums for discovery.");
    } finally {
      setIsLoadingAllMedia(false);
    }
  };

  useEffect(() => {
    if (activeView === "albums" || activeView === "discover") {
      fetchAllMedia();
    }
  }, [activeView]);

  const loadMediaForEvent = async (eventId: string) => {
    try {
      const response = await axios.get("/api/media", {
        params: { eventId },
        headers: authHeaders(),
      });
      setMedia(response.data.media || []);
    } catch {
      setMessage("Unable to load media for event.");
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const response = await axios.get("/api/search", {
        params: { query },
        headers: authHeaders(),
      });
      setSearchResults(response.data.results);
    } catch {
      setMessage("Search failed.");
    }
  };

  const handleSelectEvent = async (eventItem: EventItem) => {
    setSelectedEvent(eventItem);
    await loadMediaForEvent(eventItem.id);
    setActiveMediaIndex(0);
    setAlbumPanelOpen(true);
  };

  const handleCreateEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateEvent) {
      setMessage("You do not have permission to create events.");
      return;
    }

    try {
      await axios.post("/api/events", eventForm, {
        headers: authHeaders(),
      });
      setEventForm(defaultEventForm);
      setShowCreateForm(false);
      fetchEvents("date");
      setMessage("Event created successfully.");
    } catch {
      setMessage("Unable to create event.");
    }
  };

  const createPreviewUrls = (files: File[]) => {
    return files.map((file) => URL.createObjectURL(file));
  };

  const compressImage = (file: File, maxWidth = 1600, quality = 0.8): Promise<File> => {
    return new Promise((resolve, reject) => {
      const image = document.createElement("img") as HTMLImageElement;
      image.onload = async () => {
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Unable to compress image."));
        }
        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Image compression failed."));
            }
            resolve(new File([blob], file.name, { type: file.type }));
          },
          file.type,
          quality
        );
      };
      image.onerror = () => reject(new Error("Invalid image file."));
      image.src = URL.createObjectURL(file);
    });
  };

  const processSelectedFiles = async (files: File[]) => {
    const processedFiles: File[] = [];
    let warnings = [];

    for (const file of files) {
      if (file.type.startsWith("image/") && file.size > 2_500_000) {
        try {
          const compressed = await compressImage(file);
          processedFiles.push(compressed);
          warnings.push(`${file.name} was compressed for optimized upload.`);
          continue;
        } catch {
          processedFiles.push(file);
        }
      }

      if (file.size > 50_000_000) {
        warnings.push(`${file.name} is very large and may take longer to upload.`);
      }
      processedFiles.push(file);
    }

    setUploadWarnings(warnings.length ? warnings.join(" ") : null);
    return processedFiles;
  };

  const handleFilesChange = async (files: FileList | null) => {
    if (!files) {
      return;
    }

    const selectedFiles = Array.from(files);
    const finalFiles = await processSelectedFiles(selectedFiles);

    setUploadFiles(finalFiles);
    setPreviewUrls(createPreviewUrls(finalFiles));
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const files = event.dataTransfer.files;
    await handleFilesChange(files);
  };

  const handleUpload = async () => {
    if (!canUpload) {
      setMessage("Visitors cannot upload media. Please sign in.");
      return;
    }

    if (!selectedEvent || uploadFiles.length === 0) {
      setMessage("Select an event and choose files to upload.");
      return;
    }

    const formData = new FormData();
    uploadFiles.forEach((file) => formData.append("mediaFiles", file));
    formData.append("eventId", selectedEvent.id);
    formData.append("access", selectedEvent.access === "private" ? "private" : "public");
    formData.append("uploader", user.name);

    try {
      await axios.post("/api/media/upload", formData, {
        headers: {
          ...authHeaders(),
          "Content-Type": "multipart/form-data",
        },
      });
      setUploadFiles([]);
      setPreviewUrls([]);
      setUploadWarnings(null);
      loadMediaForEvent(selectedEvent.id);
      setMessage("Upload complete.");
    } catch {
      setMessage("Upload failed.");
    }
  };

  const handleDeleteMedia = async (item: MediaItem) => {
    if (!canDeleteMedia) {
      setMessage("Only admin or photographer users can delete photos.");
      return;
    }

    try {
      await axios.delete(`/api/media/${item.id}`, {
        headers: authHeaders(),
      });
      const remaining = Math.max(0, filteredMedia.length - 1);
      setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
      setActiveMediaIndex((current) => Math.min(current, Math.max(0, remaining - 1)));
      setMessage("Photo deleted.");
    } catch {
      setMessage("Unable to delete photo.");
    }
  };

  const goToPreviousMedia = () => {
    if (filteredMedia.length === 0) return;
    setActiveMediaIndex((current) => (current === 0 ? filteredMedia.length - 1 : current - 1));
  };

  const goToNextMedia = () => {
    if (filteredMedia.length === 0) return;
    setActiveMediaIndex((current) => (current === filteredMedia.length - 1 ? 0 : current + 1));
  };

  const handleLike = async (item: MediaItem) => {
    try {
      const response = await axios.post(`/api/media/${item.id}/like`, null, {
        headers: authHeaders(),
      });
      setMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, likes: response.data.likes } : mediaItem)));
      fetchNotifications();
    } catch {
      setMessage("Unable to like media.");
    }
  };

  const handleFavorite = async (item: MediaItem) => {
    try {
      const response = await axios.post(`/api/media/${item.id}/favorite`, null, {
        headers: authHeaders(),
      });
      setMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, favorites: response.data.favorites } : mediaItem)));
      fetchNotifications();
    } catch {
      setMessage("Unable to favorite media.");
    }
  };

  const handleComment = async (item: MediaItem) => {
    const text = commentDrafts[item.id]?.trim();
    if (!text) {
      setMessage("Enter a comment before posting.");
      return;
    }

    try {
      const response = await axios.post(
        `/api/media/${item.id}/comment`,
        { text },
        { headers: authHeaders() }
      );

      setMedia((current) =>
        current.map((mediaItem) =>
          mediaItem.id === item.id
            ? { ...mediaItem, comments: [response.data.comment, ...(mediaItem.comments || [])] }
            : mediaItem
        )
      );
      setCommentDrafts((current) => ({ ...current, [item.id]: "" }));
      setMessage("Comment added.");
      fetchNotifications();
    } catch {
      setMessage("Unable to post comment.");
    }
  };

  const handleShare = async (item: MediaItem) => {
    try {
      const response = await axios.post(`/api/media/${item.id}/share`, null, {
        headers: authHeaders(),
      });
      setMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, shares: response.data.shares } : mediaItem)));
      setMessage("Media shared.");
      fetchNotifications();
    } catch {
      setMessage("Unable to share media.");
    }
  };

  const handleTagUser = async (item: MediaItem) => {
    const tagName = tagDrafts[item.id]?.trim();
    if (!tagName) {
      setMessage("Enter a name to tag.");
      return;
    }

    try {
      const response = await axios.post(
        `/api/media/${item.id}/tag`,
        { taggedUser: tagName },
        { headers: authHeaders() }
      );
      setMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, taggedUsers: response.data.taggedUsers } : mediaItem)));
      setTagDrafts((current) => ({ ...current, [item.id]: "" }));
      setMessage(`${tagName} tagged successfully.`);
      fetchNotifications();
    } catch {
      setMessage("Unable to tag user.");
    }
  };

  const handleFaceMatch = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setIsFaceSearching(true);
    const formData = new FormData();
    formData.append("selfie", files[0]);

    try {
      const response = await axios.post("/api/face-match", formData, {
        headers: {
          ...authHeaders(),
          "Content-Type": "multipart/form-data",
        },
      });
      setFaceMatches(response.data.matches || []);
    } catch {
      setMessage("Face search failed.");
    } finally {
      setIsFaceSearching(false);
    }
  };

  const filteredEvents = useMemo(() => {
    return searchResults ? searchResults.events : events;
  }, [events, searchResults]);

  const albumCounts = useMemo(() => {
    return allMedia.reduce<Record<string, number>>((counts, item) => {
      counts[item.eventId] = (counts[item.eventId] || 0) + 1;
      return counts;
    }, {});
  }, [allMedia]);

  const filteredMedia = useMemo(() => {
    if (selectedEvent) {
      return media;
    }
    return searchResults ? searchResults.media : media;
  }, [media, searchResults, selectedEvent]);

  const activeMedia = filteredMedia[activeMediaIndex] || null;

  const closeAlbumPanel = () => {
    setAlbumPanelOpen(false);
    setActiveMediaIndex(0);
  };

  return (
    <div className="bg-white text-neutral-950 min-h-screen w-screen overflow-x-hidden">
      <header className="bg-white border-b border-neutral-200 flex px-8 justify-between items-center gap-6 h-16">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-3xl bg-neutral-900 flex items-center justify-center text-white">
            <Aperture className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight">Snapshare</h1>
            <p className="text-neutral-500 text-sm">Event & media management for clubs and photographers.</p>
          </div>
        </div>

        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input
              className="w-full pl-10"
              placeholder="Search events, tags, media, people..."
              value={searchQuery}
              onChange={(event) => handleSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="ghost" className="text-neutral-600 gap-2" onClick={handleNotificationToggle}>
              <Bell className="h-4 w-4" />
              Notifications
              {newNotificationCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-2 text-[0.65rem] font-semibold text-white">
                  {newNotificationCount}
                </span>
              )}
            </Button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-3xl border border-neutral-200 bg-white p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Notifications</p>
                  <button className="text-xs text-neutral-500" onClick={() => setNotifOpen(false)}>
                    Close
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-sm text-neutral-500">No notifications yet.</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div key={notification.id} className={`rounded-2xl p-3 ${notification.isNew ? "bg-blue-50" : "bg-neutral-100"}`}>
                        <p className="text-sm text-neutral-800">{notification.message}</p>
                        <p className="mt-1 text-xs text-neutral-500">{new Date(notification.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5">
            <Avatar>
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-neutral-700">{user.name}</span>
            <ChevronDown className="h-4 w-4 text-neutral-500" />
          </div>
        </div>
      </header>

      {albumPanelOpen && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex h-full w-full max-w-[1240px] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl md:flex-row">
            <div className="border-b border-neutral-200 p-5 md:border-b-0 md:border-r md:w-80 md:flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Album</p>
                  <h2 className="text-lg font-semibold">{selectedEvent.name}</h2>
                </div>
                <button onClick={closeAlbumPanel} className="rounded-full border border-neutral-200 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
                  Close
                </button>
              </div>
              <p className="mt-3 text-sm text-neutral-500">{selectedEvent.description || "Browse the album and interact with photos."}</p>
              <div className="mt-5 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 170px)" }}>
                {filteredMedia.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-neutral-500">
                    <p className="font-semibold">No images found</p>
                    <p className="mt-2 text-sm">This album does not have any media yet.</p>
                  </div>
                ) : (
                  filteredMedia.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveMediaIndex(index)}
                      className={`flex w-full items-center gap-3 rounded-3xl border p-3 text-left transition ${index === activeMediaIndex ? "border-blue-500 bg-blue-50" : "border-neutral-200 bg-white hover:bg-neutral-100"}`}
                    >
                      <div className="h-16 w-16 overflow-hidden rounded-3xl bg-neutral-200">
                        {item.mimeType.startsWith("video/") ? (
                          <video src={item.thumbnail} className="h-full w-full object-cover" />
                        ) : (
                          <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-neutral-900 line-clamp-1">{item.title}</p>
                        <p className="text-xs text-neutral-500">{item.uploader}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-6">
              {activeMedia ? (
                <div className="grid h-full gap-6 lg:grid-cols-[1.4fr_0.95fr]">
                  <div className="rounded-[2rem] bg-neutral-100 p-4">
                    <div className="h-full overflow-hidden rounded-[1.5rem] bg-black">
                      {activeMedia.mimeType.startsWith("video/") ? (
                        <video controls src={activeMedia.url} className="h-full w-full object-cover" />
                      ) : (
                        <img src={activeMedia.url} alt={activeMedia.title} className="h-full w-full object-cover" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-5 overflow-y-auto">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-semibold">{activeMedia.title}</h3>
                          <p className="text-sm text-neutral-500">Uploaded by {activeMedia.uploader}</p>
                        </div>
                        <Badge variant={activeMedia.access === "private" ? "secondary" : "default"}>{activeMedia.access}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {activeMedia.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
                        <span>{activeMedia.likes} Likes</span>
                        <span>{activeMedia.favorites} Favorites</span>
                        <span>{activeMedia.shares || 0} Shares</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={goToPreviousMedia} className="rounded-3xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                      </button>
                      <button onClick={goToNextMedia} className="rounded-3xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </button>
                      <button onClick={() => handleLike(activeMedia)} className="rounded-3xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800">
                        Like
                      </button>
                      <button onClick={() => handleFavorite(activeMedia)} className="rounded-3xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                        Favorite
                      </button>
                      <button onClick={() => handleShare(activeMedia)} className="rounded-3xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                        Share
                      </button>
                      <a href={`/api/media/${activeMedia.id}/download?watermark=true`} className="rounded-3xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                        Download
                      </a>
                      {canDeleteMedia && (
                        <button onClick={() => handleDeleteMedia(activeMedia)} className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete photo
                        </button>
                      )}
                    </div>
                    {activeMedia.taggedUsers && activeMedia.taggedUsers.length > 0 && (
                      <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                        Tagged: {activeMedia.taggedUsers.join(", ")}
                      </div>
                    )}
                    <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                      <p className="mb-3 text-sm font-semibold text-neutral-900">Comments</p>
                      <div className="space-y-3">
                        {activeMedia.comments && activeMedia.comments.length > 0 ? (
                          activeMedia.comments.map((comment) => (
                            <div key={comment.id} className="rounded-3xl bg-white p-4 text-sm text-neutral-700 shadow-sm">
                              <p className="font-semibold text-neutral-900">{comment.author}</p>
                              <p>{comment.text}</p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-3xl bg-white p-6 text-center text-sm text-neutral-500">
                            No comments yet.
                          </div>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        <input
                          value={commentDrafts[activeMedia.id] || ""}
                          onChange={(event) => setCommentDrafts((current) => ({ ...current, [activeMedia.id]: event.target.value }))}
                          placeholder="Write a comment..."
                          className="w-full rounded-3xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900"
                        />
                        <button onClick={() => handleComment(activeMedia)} className="w-full rounded-3xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800">
                          Post comment
                        </button>
                        <div className="grid gap-2">
                          <input
                            value={tagDrafts[activeMedia.id] || ""}
                            onChange={(event) => setTagDrafts((current) => ({ ...current, [activeMedia.id]: event.target.value }))}
                            placeholder="Tag someone with @name"
                            className="w-full rounded-3xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900"
                          />
                          <button onClick={() => handleTagUser(activeMedia)} className="w-full rounded-3xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                            Tag user
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[2rem] bg-neutral-100 p-6 text-center text-neutral-500">
                  <div>
                    <p className="text-xl font-semibold">No images found</p>
                    <p className="mt-3 text-sm">This album is empty, add media to get started.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex w-full">
        <aside className="flex flex-col gap-6 w-80">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-3">Menu</p>
            <div className="space-y-2">
              {[
                { label: "Events", icon: Calendar, view: "events" },
                { label: "Albums", icon: Image, view: "albums" },
                { label: "Upload", icon: Upload, view: "upload" },
                { label: "Discover", icon: Compass, view: "discover" },
                { label: "Settings", icon: Settings, view: "settings" },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.view;
                return (
                  <button
                    key={item.label}
                    onClick={() => setActiveView(item.view)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition ${
                      isActive ? "bg-neutral-900 text-white" : "text-neutral-800 hover:bg-neutral-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-neutral-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-neutral-900" />
              <span className="font-semibold text-sm">Go Pro</span>
            </div>
            <p className="text-neutral-500 text-sm leading-6">Unlimited albums, priority uploads, private cloud storage, and smart search.</p>
            <Button className="mt-4 w-full" variant="default">
              Upgrade
            </Button>
          </div>

          <div className="rounded-3xl bg-white border border-neutral-200 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-3">Sign in</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700" htmlFor="username">
                  Username
                </label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                  className="mt-2 w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-700" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="mt-2 w-full"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <div className="mt-4 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Demo accounts</p>
              <p>admin / admin123</p>
              <p>photographer / photographer123</p>
              <p>member / member123</p>
            </div>
            {token && (
              <Button onClick={handleLogout} variant="outline" className="mt-4 w-full">
                Logout
              </Button>
            )}
          </div>
        </aside>

        <main className="flex-1 p-8 space-y-8">
          {activeView === "events" && (
            <>
              <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">Events dashboard</h2>
                <p className="text-neutral-500">Manage event albums, uploads, privacy, and social interactions.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {canCreateEvent && (
                  <Button onClick={() => setShowCreateForm((value) => !value)}>
                    <Plus className="h-4 w-4" />
                    New event
                  </Button>
                )}
                <Button variant="outline" onClick={() => fetchEvents("name")}>By name</Button>
                <Button variant="outline" onClick={() => fetchEvents("date")}>By date</Button>
              </div>
            </div>
            {isViewer && (
              <div className="rounded-3xl bg-neutral-100 p-4 text-sm text-neutral-600">
                Visitors can only browse albums, react, and comment. Log in as admin, photographer, or member to upload or create events.
              </div>
            )}

            {showCreateForm && (
              <Card className="border-neutral-200 p-6">
                <form className="space-y-4" onSubmit={handleCreateEvent}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      placeholder="Event name"
                      value={eventForm.name}
                      onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })}
                    />
                    <Input
                      type="date"
                      value={eventForm.date}
                      onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <select
                      className="h-10 rounded-full border border-neutral-200 bg-neutral-100 px-4 text-sm"
                      value={eventForm.category}
                      onChange={(event) => setEventForm({ ...eventForm, category: event.target.value })}
                    >
                      {['Music', 'Sports', 'Tech', 'Social', 'Food', 'Art'].map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-full border border-neutral-200 bg-neutral-100 px-4 text-sm"
                      value={eventForm.access}
                      onChange={(event) => setEventForm({ ...eventForm, access: event.target.value })}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <Input
                    placeholder="Club or organizer"
                    value={eventForm.club}
                    onChange={(event) => setEventForm({ ...eventForm, club: event.target.value })}
                  />
                  <Input
                    placeholder="Short description"
                    value={eventForm.description}
                    onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })}
                  />
                  <div className="flex items-center gap-3">
                    <Button type="submit">Create event</Button>
                    <Button type="button" variant="ghost" onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">Event library</h3>
                <p className="text-neutral-500 text-sm">Browse events by status and category.</p>
              </div>
              <div className="text-sm text-neutral-500">Role: {user.role}</div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {filteredEvents.map((eventItem) => (
                <Card
                  key={eventItem.id}
                  className="overflow-hidden cursor-pointer transition hover:shadow-lg"
                  onClick={() => handleSelectEvent(eventItem)}
                >
                  <div className="relative h-44 overflow-hidden bg-neutral-200">
                    <img src={eventItem.thumbnail} alt={eventItem.name} className="h-full w-full object-cover" />
                    <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{eventItem.access}</div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">{eventItem.name}</h4>
                        <p className="text-neutral-500 text-sm">{eventItem.date}</p>
                      </div>
                      <Badge variant={eventItem.access === "private" ? "secondary" : "default"}>{eventItem.category}</Badge>
                    </div>
                    <p className="text-neutral-500 text-sm line-clamp-2">{eventItem.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {eventItem.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSelectEvent(eventItem);
                      }}
                    >
                      View album
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {selectedEvent && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{selectedEvent.name}</h3>
                  <p className="text-neutral-500 text-sm">{selectedEvent.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{selectedEvent.access}</Badge>
                  <Badge variant="secondary">{selectedEvent.category}</Badge>
                </div>
              </div>
              {filteredMedia.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {filteredMedia.map((item) => (
                    <Card key={item.id} className="overflow-hidden">
                      <div className="relative h-44 overflow-hidden bg-neutral-200">
                        <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">{item.title}</h4>
                            <p className="text-neutral-500 text-sm">Uploaded by {item.uploader}</p>
                          </div>
                          <Badge variant="secondary">{item.access}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                            <button onClick={() => handleLike(item)} className="hover:text-neutral-900">Like {item.likes}</button>
                            <button onClick={() => handleFavorite(item)} className="hover:text-neutral-900">Fav {item.favorites}</button>
                            <button onClick={() => handleShare(item)} className="hover:text-neutral-900">Share{item.shares ? ` ${item.shares}` : ""}</button>
                          </div>
                          <a href={`/api/media/${item.id}/download?watermark=true`} className="text-sm text-neutral-600 hover:text-neutral-900">
                            Download
                          </a>
                        </div>
                        {item.taggedUsers && item.taggedUsers.length > 0 && (
                          <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
                            Tagged: {item.taggedUsers.join(", ")}
                          </div>
                        )}
                        <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-3">
                          <p className="text-sm font-semibold text-neutral-900">Comments</p>
                          {item.comments && item.comments.length > 0 ? (
                            <div className="space-y-2 pt-3">
                              {item.comments.slice(0, 2).map((comment) => (
                                <div key={comment.id} className="rounded-2xl bg-white p-3 text-sm text-neutral-700 shadow-sm">
                                  <p className="font-medium text-neutral-900">{comment.author}</p>
                                  <p>{comment.text}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="pt-3 text-sm text-neutral-500">No comments yet.</p>
                          )}
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-2">
                              <input
                                value={commentDrafts[item.id] || ""}
                                onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder="Add a comment..."
                                className="h-10 rounded-2xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
                              />
                              <button
                                onClick={() => handleComment(item)}
                                className="rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
                              >
                                Post comment
                              </button>
                            </div>
                            <div className="grid gap-2">
                              <div className="text-xs text-neutral-500">Tag a friend with a name:</div>
                              <div className="flex gap-2">
                                <input
                                  value={tagDrafts[item.id] || ""}
                                  onChange={(event) => setTagDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                  placeholder="Type a name and tag"
                                  className="h-10 flex-1 rounded-2xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
                                />
                                <button
                                  onClick={() => handleTagUser(item)}
                                  className="rounded-2xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                                >
                                  Tag
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center text-neutral-500">
                  <p className="text-lg font-semibold">No images found</p>
                  <p className="mt-2 text-sm">This album does not have any media yet.</p>
                </div>
              )}
            </section>
          )}

          {canUpload ? (
            <section className="grid gap-6 xl:grid-cols-2">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Upload media</h3>
                    <p className="text-neutral-500 text-sm">Drag and drop photos or videos to add event content.</p>
                  </div>
                  <Badge>{selectedEvent ? selectedEvent.name : "No event selected"}</Badge>
                </div>
                <div className="space-y-4">
                  <label
                    className={`block rounded-3xl border border-dashed p-6 text-center text-sm transition ${dragActive ? "border-blue-500 bg-blue-50 text-blue-900" : "border-neutral-300 bg-neutral-100 text-neutral-600"}`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="mb-3 text-neutral-500">Choose files to upload</div>
                    <div className="text-xs text-neutral-500">You can drag and drop photos or videos, or click to browse.</div>
                    <input type="file" multiple onChange={(event) => handleFilesChange(event.target.files)} className="hidden" />
                  </label>

                  {uploadWarnings && (
                    <div className="rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900">{uploadWarnings}</div>
                  )}

                  {previewUrls.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {previewUrls.map((preview, index) => {
                        const file = uploadFiles[index];
                        const isVideo = file?.type.startsWith("video/");
                        return (
                          <div key={index} className="overflow-hidden rounded-3xl bg-neutral-950/5">
                            {isVideo ? (
                              <video controls src={preview} className="h-28 w-full object-cover" />
                            ) : (
                              <img src={preview} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Button disabled={!selectedEvent || uploadFiles.length === 0} onClick={handleUpload}>
                    Upload files
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Facial recognition</h3>
                    <p className="text-neutral-500 text-sm">Upload a selfie to find matching photos.</p>
                  </div>
                  <Badge variant="secondary">Personal</Badge>
                </div>
                <label className="block rounded-3xl border border-dashed border-neutral-300 bg-neutral-100 p-6 text-center text-sm text-neutral-600 hover:border-neutral-400">
                  <div className="mb-3">Select a reference selfie</div>
                  <input type="file" accept="image/*" onChange={(event) => handleFaceMatch(event.target.files)} className="hidden" />
                </label>
                <div className="grid gap-3 pt-4">
                  {isFaceSearching ? (
                    <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700">
                      Searching for your face in uploaded photos...
                    </div>
                  ) : faceMatches.length > 0 ? (
                    faceMatches.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-3xl border border-neutral-200 p-3">
                        <img src={item.thumbnail} alt={item.title} className="h-14 w-14 rounded-2xl object-cover" />
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-neutral-500 text-sm">{item.uploader}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-neutral-500 text-sm">Upload a selfie to reveal personalized matches.</p>
                  )}
                </div>
              </Card>
            </section>
          ) : (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Visitor access</h3>
                  <p className="text-neutral-500 text-sm">Visitors can browse albums, react, and comment only.</p>
                </div>
                <Badge variant="secondary">Read only</Badge>
              </div>
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-500">
                Sign in as admin, photographer, or member to upload media or use facial recognition.
              </div>
            </Card>
          )}
        </>
      )}

          {activeView === "albums" && (
            <section className="space-y-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Albums</h2>
                  <p className="text-neutral-500">Browse all event albums and see how many photos are available.</p>
                </div>
                <Button variant="outline" onClick={fetchAllMedia}>
                  Refresh albums
                </Button>
              </div>

              {isLoadingAllMedia ? (
                <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-10 text-center text-neutral-500">
                  Loading albums...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {events.map((eventItem) => (
                    <Card key={eventItem.id} className="overflow-hidden cursor-pointer transition hover:shadow-lg" onClick={() => handleSelectEvent(eventItem)}>
                      <div className="relative h-44 overflow-hidden bg-neutral-200">
                        <img src={eventItem.thumbnail} alt={eventItem.name} className="h-full w-full object-cover" />
                        <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{eventItem.access}</div>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">{eventItem.name}</h4>
                            <p className="text-neutral-500 text-sm">{albumCounts[eventItem.id] || 0} photos</p>
                          </div>
                          <Badge variant={eventItem.access === "private" ? "secondary" : "default"}>{eventItem.category}</Badge>
                        </div>
                        <p className="text-neutral-500 text-sm line-clamp-2">{eventItem.description}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === "discover" && (
            <section className="space-y-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Discover</h2>
                  <p className="text-neutral-500">Search results and trending media appear here.</p>
                </div>
                <Button variant="outline" onClick={fetchAllMedia}>
                  Refresh media
                </Button>
              </div>

              {isLoadingAllMedia ? (
                <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-10 text-center text-neutral-500">
                  Loading media...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {(searchResults ? searchResults.media : allMedia).slice(0, 9).map((item) => (
                    <Card key={item.id} className="overflow-hidden">
                      <div className="relative h-44 overflow-hidden bg-neutral-200">
                        <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">{item.title}</h4>
                            <p className="text-neutral-500 text-sm">{item.uploader}</p>
                          </div>
                          <Badge variant={item.access === "private" ? "secondary" : "default"}>{item.access}</Badge>
                        </div>
                        <p className="text-neutral-500 text-sm">{item.tags.slice(0, 3).join(", ")}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                          <span>{item.likes} likes</span>
                          <span>{item.favorites} favorites</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === "settings" && (
            <section className="space-y-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Settings</h2>
                  <p className="text-neutral-500">Manage your account, role, and notification preferences.</p>
                </div>
                <Badge variant="secondary">{user.role}</Badge>
              </div>

              <Card className="p-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-neutral-500">Signed in as</p>
                    <h3 className="text-lg font-semibold">{user.name}</h3>
                    <p className="text-neutral-500 text-sm">Role: {user.role}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">User ID</p>
                      <p className="mt-2 font-medium text-neutral-900">{user.id}</p>
                    </div>
                    <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Avatar</p>
                      <p className="mt-2 text-neutral-900 break-words">{user.avatar}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button onClick={handleLogout}>Log out</Button>
                    <Button variant="outline" onClick={() => setActiveView("events")}>Back to dashboard</Button>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {activeView === "upload" && (
            <>
              {canUpload ? (
                <section className="grid gap-6 xl:grid-cols-2">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Upload media</h3>
                        <p className="text-neutral-500 text-sm">Drag and drop photos or videos to add event content.</p>
                      </div>
                      <Badge>{selectedEvent ? selectedEvent.name : "No event selected"}</Badge>
                    </div>
                    <div className="space-y-4">
                      <label
                        className={`block rounded-3xl border border-dashed p-6 text-center text-sm transition ${dragActive ? "border-blue-500 bg-blue-50 text-blue-900" : "border-neutral-300 bg-neutral-100 text-neutral-600"}`}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="mb-3 text-neutral-500">Choose files to upload</div>
                        <div className="text-xs text-neutral-500">You can drag and drop photos or videos, or click to browse.</div>
                        <input type="file" multiple onChange={(event) => handleFilesChange(event.target.files)} className="hidden" />
                      </label>

                      {uploadWarnings && (
                        <div className="rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900">{uploadWarnings}</div>
                      )}

                      {previewUrls.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {previewUrls.map((preview, index) => {
                            const file = uploadFiles[index];
                            const isVideo = file?.type.startsWith("video/");
                            return (
                              <div key={index} className="overflow-hidden rounded-3xl bg-neutral-950/5">
                                {isVideo ? (
                                  <video controls src={preview} className="h-28 w-full object-cover" />
                                ) : (
                                  <img src={preview} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <Button disabled={!selectedEvent || uploadFiles.length === 0} onClick={handleUpload}>
                        Upload files
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Facial recognition</h3>
                        <p className="text-neutral-500 text-sm">Upload a selfie to find matching photos.</p>
                      </div>
                      <Badge variant="secondary">Personal</Badge>
                    </div>
                    <label className="block rounded-3xl border border-dashed border-neutral-300 bg-neutral-100 p-6 text-center text-sm text-neutral-600 hover:border-neutral-400">
                      <div className="mb-3">Select a reference selfie</div>
                      <input type="file" accept="image/*" onChange={(event) => handleFaceMatch(event.target.files)} className="hidden" />
                    </label>
                    <div className="grid gap-3 pt-4">
                      {isFaceSearching ? (
                        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700">
                          Searching for your face in uploaded photos...
                        </div>
                      ) : faceMatches.length > 0 ? (
                        faceMatches.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-3xl border border-neutral-200 p-3">
                            <img src={item.thumbnail} alt={item.title} className="h-14 w-14 rounded-2xl object-cover" />
                            <div>
                              <p className="font-medium">{item.title}</p>
                              <p className="text-neutral-500 text-sm">{item.uploader}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-500 text-sm">Upload a selfie to reveal personalized matches.</p>
                      )}
                    </div>
                  </Card>
                </section>
              ) : (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Visitor access</h3>
                      <p className="text-neutral-500 text-sm">Visitors can browse albums, react, and comment only.</p>
                    </div>
                    <Badge variant="secondary">Read only</Badge>
                  </div>
                  <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-500">
                    Sign in as admin, photographer, or member to upload media or use facial recognition.
                  </div>
                </Card>
              )}
            </>
          )}

          {message && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {message}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
