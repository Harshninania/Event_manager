import { useEffect, useMemo, useState, useRef } from "react";
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
  Heart,
  Bookmark,
  Send,
  Download,
  ScanFace,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Clerk Auth SDK
import { useAuth, useUser, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";

// Supabase Database SDK
import { createClient } from "@supabase/supabase-js";

// Client-Side Face Recognition
import { loadFaceModels, extractFaceDescriptor, compareFaces, extractFaceDescriptors } from "./lib/face-recognition";

// Firebase App and Cloud Messaging SDKs
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

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

const CATEGORY_PRESETS: Record<string, string> = {
  music: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  tech: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  social: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  food: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  art: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800"
};

// ----------------------------------------------------
// INSTAGRAM POST CARD COMPONENT
// ----------------------------------------------------
function InstagramCard({
  item,
  user,
  authHeaders,
  onLike,
  onFavorite,
  onShare,
  onDelete,
  canDelete,
}: {
  item: MediaItem;
  user: User;
  authHeaders: () => any;
  onLike: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onShare: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
  canDelete?: boolean;
}) {
  const [commentText, setCommentText] = useState("");
  const [tagText, setTagText] = useState("");
  const [showAllComments, setShowAllComments] = useState(false);
  const [heartAnim, setHeartAnim] = useState(false);
  const [comments, setComments] = useState(item.comments || []);
  const [likes, setLikes] = useState(item.likes || 0);
  const [shares, setShares] = useState(item.shares || 0);
  const [favorites, setFavorites] = useState(item.favorites || 0);
  const [taggedUsers, setTaggedUsers] = useState(item.taggedUsers || []);

  useEffect(() => {
    setComments(item.comments || []);
  }, [item.comments]);
  useEffect(() => {
    setLikes(item.likes);
  }, [item.likes]);
  useEffect(() => {
    setFavorites(item.favorites);
  }, [item.favorites]);
  useEffect(() => {
    setShares(item.shares || 0);
  }, [item.shares]);
  useEffect(() => {
    setTaggedUsers(item.taggedUsers || []);
  }, [item.taggedUsers]);

  const handleDoubleTap = () => {
    if (user.role === "viewer") return;
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
    handleLocalLike();
  };

  const handleLocalLike = async () => {
    if (user.role === "viewer") return;
    try {
      setLikes((l) => l + 1);
      await onLike(item);
    } catch (err) {
      setLikes((l) => l - 1);
    }
  };

  const handleLocalFavorite = async () => {
    if (user.role === "viewer") return;
    try {
      setFavorites((f) => f + 1);
      await onFavorite(item);
    } catch (err) {
      setFavorites((f) => f - 1);
    }
  };

  const handleLocalComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const text = commentText.trim();
    setCommentText("");

    try {
      const response = await axios.post(
        `/api/media/${item.id}/comment`,
        { text },
        { headers: authHeaders() }
      );
      
      const newComment = {
        id: response.data.comment.id,
        author: user.name,
        text: text,
        createdAt: response.data.comment.createdAt,
        mentions: response.data.comment.mentions
      };
      
      setComments((prev) => [newComment, ...prev]);
    } catch (err) {
      console.error("Failed to post comment:", err);
    }
  };

  const handleLocalTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagText.trim()) return;
    const name = tagText.trim();
    setTagText("");

    try {
      const response = await axios.post(
        `/api/media/${item.id}/tag`,
        { taggedUser: name },
        { headers: authHeaders() }
      );
      setTaggedUsers(response.data.taggedUsers);
    } catch (err) {
      console.error("Failed to tag user:", err);
    }
  };

  const displayedComments = showAllComments ? comments : comments.slice(0, 2);

  return (
    <Card className="mx-auto w-full max-w-[480px] overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-neutral-200">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(item.uploader)}`} alt={item.uploader} />
            <AvatarFallback>{item.uploader.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-neutral-900 leading-tight">{item.uploader}</p>
            <p className="text-[11px] text-neutral-500">
              {item.access === "private" ? "🔒 Private Album" : "🌍 Public Album"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(item)}
              className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 transition"
              title="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <Badge variant={item.access === "private" ? "secondary" : "default"} className="text-[10px] py-0 px-2 rounded-full uppercase font-bold tracking-wider">
            {item.access}
          </Badge>
        </div>
      </div>

      <div
        className="relative aspect-square w-full overflow-hidden bg-neutral-950 cursor-pointer select-none"
        onDoubleClick={handleDoubleTap}
      >
        {item.mimeType.startsWith("video/") ? (
          <video controls src={item.url} className="h-full w-full object-cover" />
        ) : (
          <img src={item.url} alt={item.title} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
        )}

        {heartAnim && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 animate-fade-in">
            <div className="animate-ping absolute h-20 w-20 rounded-full bg-white/20" />
            <svg
              className="h-24 w-24 text-red-500 fill-current drop-shadow-lg scale-up-heart"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLocalLike} 
            disabled={user.role === "viewer"}
            className={`group flex items-center transition active:scale-90 ${user.role === "viewer" ? "opacity-40 cursor-not-allowed" : ""}`}
            title={user.role === "viewer" ? "Log in to like" : "Like photo"}
          >
            <svg
              className={`h-6 w-6 transition duration-200 ${
                user.role !== "viewer" ? "group-hover:text-red-500 hover:scale-110" : ""
              } ${
                likes > item.likes ? "text-red-500 fill-current" : "text-neutral-800"
              }`}
              xmlns="http://www.w3.org/2000/svg"
              fill={likes > item.likes ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </button>

          <button 
            className="group flex items-center transition hover:scale-110 text-neutral-800"
            onClick={() => onShare(item)}
          >
            <svg
              className="h-6 w-6 group-hover:text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </button>

          <button onClick={() => onShare(item)} className="group flex items-center transition hover:scale-110 text-neutral-800">
            <svg
              className="h-6 w-6 group-hover:text-emerald-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.684 10.742l4.828-2.414m0 0a3 3 0 10-3.62-1.09l-4.829 2.414m5.273-3.738L13.5 8.25m-2.116 2.116L8.683 13.258m0 0a3 3 0 103.62 1.09l4.829-2.414m-5.273 3.738L13.5 13.25"
              />
            </svg>
            {shares > 0 && <span className="text-xs font-semibold text-neutral-600 ml-1">{shares}</span>}
          </button>
        </div>

        <button 
          onClick={handleLocalFavorite} 
          disabled={user.role === "viewer"}
          className={`group flex items-center transition active:scale-90 ${user.role === "viewer" ? "opacity-40 cursor-not-allowed" : ""}`}
          title={user.role === "viewer" ? "Log in to favorite" : "Favorite photo"}
        >
          <svg
            className={`h-6 w-6 transition duration-200 ${
              user.role !== "viewer" ? "group-hover:text-amber-500 hover:scale-110" : ""
            } ${
              favorites > item.favorites ? "text-amber-500 fill-current" : "text-neutral-800"
            }`}
            xmlns="http://www.w3.org/2000/svg"
            fill={favorites > item.favorites ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>
      </div>

      <div className="px-4 py-2 space-y-1.5">
        <p className="text-sm font-bold text-neutral-900">
          {likes > 0 ? `${likes.toLocaleString()} likes` : "Be the first to like this"}
        </p>

        <div>
          <span className="text-sm font-bold text-neutral-900 mr-2">{item.uploader}</span>
          <span className="text-sm text-neutral-800">{item.title}</span>
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {item.tags.map((tag) => (
              <span key={tag} className="text-xs font-semibold text-blue-600 cursor-pointer hover:underline">
                #{tag.toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {taggedUsers.length > 0 && (
          <p className="text-xs text-neutral-500">
            🏷️ Tagged: <span className="font-semibold">{taggedUsers.join(", ")}</span>
          </p>
        )}
      </div>

      <div className="px-4 pb-2 border-t border-neutral-100/50 pt-2 space-y-2">
        {comments.length > 2 && (
          <button
            onClick={() => setShowAllComments(!showAllComments)}
            className="text-xs text-neutral-500 hover:text-neutral-700 font-medium transition"
          >
            {showAllComments ? "Hide comments" : `View all ${comments.length} comments`}
          </button>
        )}

        {displayedComments.length > 0 ? (
          <div className="space-y-1.5">
            {displayedComments.map((comment) => (
              <div key={comment.id} className="text-xs leading-relaxed text-neutral-700">
                <span className="font-semibold text-neutral-900 mr-2">{comment.author}</span>
                <span>{comment.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400 italic">No comments yet. Write something below...</p>
        )}
      </div>

      {user.role === "viewer" ? (
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/50 text-center">
          <p className="text-xs text-neutral-500 font-medium">
            🔒 Sign in to comment or tag users
          </p>
        </div>
      ) : (
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/50">
          <form onSubmit={handleLocalComment} className="flex gap-2 items-center">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full bg-transparent text-xs text-neutral-900 outline-none placeholder-neutral-400 py-1"
            />
            <button
              type="submit"
              disabled={!commentText.trim()}
              className={`text-xs font-bold transition ${
                commentText.trim() ? "text-blue-500 hover:text-blue-700" : "text-blue-300 cursor-default"
              }`}
            >
              Post
            </button>
          </form>

          <form onSubmit={handleLocalTag} className="flex gap-2 items-center mt-2 border-t border-neutral-100 pt-2">
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="Tag a user (e.g. member)..."
              className="w-full bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400 py-1"
            />
            <button
              type="submit"
              disabled={!tagText.trim()}
              className={`text-[11px] font-semibold transition ${
                tagText.trim() ? "text-neutral-700 hover:text-neutral-900" : "text-neutral-400 cursor-default"
              }`}
            >
              Tag
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}

// Detect environment capabilities
const isClerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isSupabaseEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

const supabase = isSupabaseEnabled
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null;

// Firebase Configuration and Initialization
const firebaseConfig = {
  apiKey: "AIzaSyB97tXjS94idnkPXkdd4rBb2WC7Rg0sDgY",
  authDomain: "event-management-website-3c294.firebaseapp.com",
  projectId: "event-management-website-3c294",
  storageBucket: "event-management-website-3c294.firebasestorage.app",
  messagingSenderId: "662300060747",
  appId: "1:662300060747:web:512673ecfb0f23990d31ce",
  measurementId: "G-Q94THGHNEH"
};

const firebaseApp = initializeApp(firebaseConfig);
const messaging = typeof window !== "undefined" ? getMessaging(firebaseApp) : null;
const DISCOVER_CATEGORIES = [
  { name: "Animals", query: "animals", image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=400" },
  { name: "Art", query: "art", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&q=80&w=400" },
  { name: "Beauty", query: "beauty", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=400" },
  { name: "Design", query: "design", image: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&q=80&w=400" },
  { name: "Diy And Crafts", query: "diy crafts", image: "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&q=80&w=400" },
  { name: "Food And Drink", query: "food", image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&q=80&w=400" },
  { name: "Home Decor", query: "home decor", image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=400" },
  { name: "Mens Fashion", query: "mens fashion", image: "https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&q=80&w=400" },
  { name: "Quotes", query: "quotes", image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&q=80&w=400" },
  { name: "Tattoos", query: "tattoos", image: "https://images.unsplash.com/photo-1590246814883-57f511e76533?auto=format&fit=crop&q=80&w=400" },
  { name: "Architecture", query: "architecture", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400" },
  { name: "Travel", query: "travel", image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=400" },
  { name: "Nature", query: "nature", image: "https://images.unsplash.com/photo-1472214222541-d510753a49f8?auto=format&fit=crop&q=80&w=400" },
  { name: "Space", query: "space", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=400" },
  { name: "Technology", query: "technology", image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=400" }
];

const getFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const [referenceSelfie, setReferenceSelfie] = useState<string | null>(null);
  const [faceScanningProgress, setFaceScanningProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeView, setActiveView] = useState<"events" | "albums" | "upload" | "discover" | "settings" | "personal">("events");
  const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
  const [isLoadingAllMedia, setIsLoadingAllMedia] = useState(false);
  const [discoverMedia, setDiscoverMedia] = useState<MediaItem[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [isFetchingDiscover, setIsFetchingDiscover] = useState(false);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(true);
  const [selectedDiscoverMedia, setSelectedDiscoverMedia] = useState<MediaItem | null>(null);
  const [discoverCommentDraft, setDiscoverCommentDraft] = useState("");
  const [discoverCategory, setDiscoverCategory] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [eventSort, setEventSort] = useState<"date" | "name" | "category">("date");
  const [eventFilter, setEventFilter] = useState<"all" | "public" | "private">("all");
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchEvents(eventSort);
  }, [eventSort]);

  const isFetchingRef = useRef(isFetchingDiscover);
  const pageRef = useRef(discoverPage);
  const hasMoreRef = useRef(hasMoreDiscover);
  const categoryRef = useRef(discoverCategory);

  useEffect(() => {
    isFetchingRef.current = isFetchingDiscover;
  }, [isFetchingDiscover]);

  useEffect(() => {
    pageRef.current = discoverPage;
  }, [discoverPage]);

  useEffect(() => {
    hasMoreRef.current = hasMoreDiscover;
  }, [hasMoreDiscover]);

  useEffect(() => {
    categoryRef.current = discoverCategory;
  }, [discoverCategory]);
  const [isFaceSearching, setIsFaceSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [eventForm, setEventForm] = useState(defaultEventForm);
  const [coverSource, setCoverSource] = useState<"preset" | "url" | "upload">("preset");
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
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

  // Clerk Auth Integration
  const clerk = isClerkEnabled ? useUser() : null;
  const clerkAuth = isClerkEnabled ? useAuth() : null;

  useEffect(() => {
    if (!isClerkEnabled) {
      loginAs("viewer");
    }
  }, []);

  // Sync Clerk Session with App State
  useEffect(() => {
    const syncClerkSession = async () => {
      if (isClerkEnabled && clerkAuth?.isSignedIn && clerk?.user) {
        try {
          const t = await clerkAuth.getToken();
          setToken(t);
          
          // Determine user role from Clerk metadata and email matching
          const emails = clerk.user.emailAddresses ? clerk.user.emailAddresses.map(e => e.emailAddress) : [];
          let role = (clerk.user.publicMetadata?.role as Role) || "member";
          if (emails.includes("harshninania2006@gmail.com")) {
            role = "admin";
          }
          
          setUser({
            id: clerk.user.id,
            name: clerk.user.firstName ? `${clerk.user.firstName} ${clerk.user.lastName || ""}`.trim() : clerk.user.username || "User",
            role: role,
            avatar: clerk.user.imageUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
          });
        } catch (err) {
          console.error("Clerk session sync failed:", err);
        }
      } else if (isClerkEnabled && !clerkAuth?.isSignedIn) {
        setUser({
          id: "guest",
          name: "Visitor",
          role: "viewer",
          avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=200",
        });
        setToken(null);
      }
    };
    syncClerkSession();
  }, [clerkAuth?.isSignedIn, clerk?.user]);

  // Configure Axios default headers dynamically
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // Request Notification permission and retrieve the FCM device token
  useEffect(() => {
    const registerFCM = async () => {
      if (!token || user.role === "viewer" || !messaging) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const currentToken = await getToken(messaging, {
            vapidKey: FCM_VAPID_KEY,
          });
          if (currentToken) {
            await axios.post("/api/notifications/register-token", 
              { token: currentToken },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log("FCM Token registered successfully:", currentToken);
          } else {
            console.warn("No registration token available.");
          }
        } else {
          console.warn("Notification permission denied.");
        }
      } catch (err) {
        console.error("An error occurred while retrieving FCM token:", err);
      }
    };

    registerFCM();
  }, [token, user.id]);

  // Listen for foreground FCM messages
  useEffect(() => {
    if (!messaging) return;
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("Message received in foreground: ", payload);
      fetchNotifications();
      if (payload.notification) {
        if (Notification.permission === "granted") {
          new Notification(payload.notification.title || "Snapshare Alert", {
            body: payload.notification.body,
            icon: "/logo.png"
          });
        }
      }
    });
    return () => unsubscribe();
  }, [messaging, token]);

  // Supabase Realtime Subscription Integration
  useEffect(() => {
    if (!supabase) return;

    // Listen for likes, tags and other edits on the media table
    const mediaChannel = supabase
      .channel("supabase-media")
      .on("postgres_changes", { event: "*", schema: "public", table: "media" }, (payload) => {
        const updatedItem = payload.new as any;
        const mappedUpdate = {
          likes: updatedItem.likes,
          favorites: updatedItem.favorites,
          shares: updatedItem.shares,
          taggedUsers: updatedItem.tagged_users || []
        };

        setMedia((current) =>
          current.map((item) =>
            item.id === updatedItem.id ? { ...item, ...mappedUpdate } : item
          )
        );

        setAllMedia((current) =>
          current.map((item) =>
            item.id === updatedItem.id ? { ...item, ...mappedUpdate } : item
          )
        );
      })
      .subscribe();

    // Listen for new comments
    const commentsChannel = supabase
      .channel("supabase-comments")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        const newComment = payload.new as any;
        const commentItem = {
          id: newComment.id,
          author: newComment.author,
          text: newComment.text,
          createdAt: newComment.created_at,
          mentions: newComment.mentions || []
        };

        setMedia((current) =>
          current.map((item) => {
            if (item.id === newComment.media_id) {
              const alreadyExists = item.comments?.some(c => c.id === commentItem.id);
              if (alreadyExists) return item;
              return {
                ...item,
                comments: [commentItem, ...(item.comments || [])]
              };
            }
            return item;
          })
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(mediaChannel);
      supabase.removeChannel(commentsChannel);
    };
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

  const loadDiscoverPhotos = async (page: number, cat = categoryRef.current) => {
    if (isFetchingRef.current || (!hasMoreRef.current && page > 1)) return;
    isFetchingRef.current = true;
    setIsFetchingDiscover(true);
    try {
      const response = await axios.get(`/api/discover/photos`, {
        params: { page, limit: 12, category: cat },
        headers: authHeaders(),
      });
      const items = response.data.photos;
      if (!items || items.length === 0) {
        setHasMoreDiscover(false);
        hasMoreRef.current = false;
        return;
      }
      
      setDiscoverMedia((current) => {
        if (page === 1) return items;
        const existingIds = new Set(current.map(m => m.id));
        const newItems = items.filter((m: any) => !existingIds.has(m.id));
        return [...current, ...newItems];
      });
      setDiscoverPage(page);
      pageRef.current = page;
    } catch (err) {
      console.error("Failed to load Unsplash photos:", err);
    } finally {
      setIsFetchingDiscover(false);
      setTimeout(() => {
        isFetchingRef.current = false;
      }, 800);
    }
  };

  const handleRefreshDiscover = async () => {
    setDiscoverMedia([]);
    setDiscoverPage(1);
    setHasMoreDiscover(true);
    isFetchingRef.current = false;
    hasMoreRef.current = true;
    pageRef.current = 1;
    await loadDiscoverPhotos(1, categoryRef.current);
  };

  const handleCategorySelect = (catQuery: string) => {
    const nextCat = discoverCategory === catQuery ? "" : catQuery;
    setDiscoverCategory(nextCat);
    setDiscoverMedia([]);
    setDiscoverPage(1);
    setHasMoreDiscover(true);
    isFetchingRef.current = false;
    hasMoreRef.current = true;
    pageRef.current = 1;
    loadDiscoverPhotos(1, nextCat);
  };

  const handleLikeDiscover = (item: MediaItem) => {
    setDiscoverMedia(current =>
      current.map(m => m.id === item.id ? { ...m, likes: m.likes + 1 } : m)
    );
    setSelectedDiscoverMedia(current =>
      current && current.id === item.id ? { ...current, likes: current.likes + 1 } : current
    );
  };

  const handleFavoriteDiscover = (item: MediaItem) => {
    setDiscoverMedia(current =>
      current.map(m => m.id === item.id ? { ...m, favorites: m.favorites + 1 } : m)
    );
    setSelectedDiscoverMedia(current =>
      current && current.id === item.id ? { ...current, favorites: current.favorites + 1 } : current
    );
  };

  const handleCommentDiscover = (item: MediaItem) => {
    if (!discoverCommentDraft.trim()) return;
    const newComment = {
      id: `c-p-${Date.now()}`,
      author: user.name,
      text: discoverCommentDraft.trim(),
      createdAt: new Date().toISOString()
    };
    setDiscoverMedia(current =>
      current.map(m => m.id === item.id ? { ...m, comments: [newComment, ...(m.comments || [])] } : m)
    );
    setSelectedDiscoverMedia(current =>
      current && current.id === item.id ? { ...current, comments: [newComment, ...(current.comments || [])] } : current
    );
    setDiscoverCommentDraft("");
  };

  useEffect(() => {
    if (activeView === "albums" || activeView === "discover") {
      fetchAllMedia();
    }
    if (activeView === "discover" && discoverMedia.length === 0) {
      loadDiscoverPhotos(1);
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "discover") return;

    let observer: IntersectionObserver | null = null;
    const timeout = setTimeout(() => {
      const sentinel = document.getElementById("discover-sentinel");
      if (!sentinel) return;

      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !isFetchingRef.current && hasMoreRef.current) {
            loadDiscoverPhotos(pageRef.current + 1);
          }
        },
        { threshold: 0.1 }
      );

      observer.observe(sentinel);
    }, 200);

    return () => {
      clearTimeout(timeout);
      if (observer) observer.disconnect();
    };
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
      const formData = new FormData();
      formData.append("name", eventForm.name);
      formData.append("description", eventForm.description);
      formData.append("category", eventForm.category);
      formData.append("date", eventForm.date);
      formData.append("access", eventForm.access);
      formData.append("club", eventForm.club);

      if (coverSource === "upload" && coverFile) {
        formData.append("thumbnail", coverFile);
      } else if (coverSource === "url" && customCoverUrl.trim()) {
        formData.append("thumbnailUrl", customCoverUrl.trim());
      }

      await axios.post("/api/events", formData, {
        headers: {
          ...authHeaders(),
          "Content-Type": "multipart/form-data"
        },
      });

      setEventForm(defaultEventForm);
      setCoverSource("preset");
      setCustomCoverUrl("");
      setCoverFile(null);
      setCoverPreview("");
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

    setUploadProgress(0);
    try {
      // Compute SHA-256 hashes of all selected files
      const fileHashes = await Promise.all(uploadFiles.map((file) => getFileHash(file)));

      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append("mediaFiles", file));
      formData.append("eventId", selectedEvent.id);
      formData.append("access", selectedEvent.access === "private" ? "private" : "public");
      formData.append("uploader", user.name);
      fileHashes.forEach((hash) => formData.append("fileHashes", hash));

      const response = await axios.post("/api/media/upload", formData, {
        headers: {
          ...authHeaders(),
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });
      setUploadProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 650));
      setUploadProgress(null);
      setUploadFiles([]);
      setPreviewUrls([]);
      setUploadWarnings(null);
      loadMediaForEvent(selectedEvent.id);
      
      let msg = "Upload complete.";
      const skipped = response.data.skippedDuplicates || [];
      const created = response.data.createdMedia || [];
      if (skipped.length > 0) {
        if (created.length === 0) {
          msg = `No new files uploaded. ${skipped.length} duplicate file(s) skipped.`;
        } else {
          msg = `Upload complete. ${created.length} new file(s) uploaded, ${skipped.length} duplicate(s) skipped.`;
        }
      }
      setMessage(msg);
    } catch {
      setUploadProgress(null);
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

  const handleDeleteEvent = async (eventItem: EventItem) => {
    if (user.role !== "admin") {
      setMessage("Only admin users can delete albums.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the album "${eventItem.name}" and all its photos?`)) {
      return;
    }

    try {
      await axios.delete(`/api/events/${eventItem.id}`, {
        headers: authHeaders(),
      });

      setEvents((current) => current.filter((evt) => evt.id !== eventItem.id));
      setMedia((current) => current.filter((m) => m.eventId !== eventItem.id));
      setAllMedia((current) => current.filter((m) => m.eventId !== eventItem.id));

      if (searchResults) {
        setSearchResults((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            events: prev.events.filter((evt) => evt.id !== eventItem.id),
            media: prev.media.filter((m) => m.eventId !== eventItem.id),
          };
        });
      }

      if (selectedEvent?.id === eventItem.id) {
        setSelectedEvent(null);
        setActiveView("events");
      }

      setMessage("Album deleted successfully.");
    } catch {
      setMessage("Unable to delete album.");
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

  const handleAutoTag = async (item: MediaItem) => {
    setIsAutoTagging(true);
    try {
      const response = await axios.post(`/api/media/${item.id}/autotag`, null, {
        headers: authHeaders(),
      });
      const newTags = response.data.tags;

      setMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, tags: newTags } : mediaItem)));
      setAllMedia((current) => current.map((mediaItem) => (mediaItem.id === item.id ? { ...mediaItem, tags: newTags } : mediaItem)));

      setMessage("AI tags generated successfully.");
    } catch {
      setMessage("Unable to generate AI tags.");
    } finally {
      setIsAutoTagging(false);
    }
  };

  const handleFaceMatch = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setIsFaceSearching(true);
    setFaceMatches([]);
    setFaceScanningProgress(null);
    setMessage("Loading Face Recognition neural network...");

    try {
      // Load face-api models
      await loadFaceModels();
      setMessage("Extracting face features from selfie...");

      const selfieFile = files[0];
      const selfieUrl = URL.createObjectURL(selfieFile);
      setReferenceSelfie(selfieUrl);
      const selfieDescriptor = await extractFaceDescriptor(selfieUrl);

      if (!selfieDescriptor) {
        setMessage("Unable to detect a face in your selfie. Please try a clearer picture.");
        setIsFaceSearching(false);
        return;
      }

      let mediaToScan = allMedia;
      if (mediaToScan.length === 0) {
        setMessage("Fetching all gallery photos from server...");
        const response = await axios.get("/api/media", {
          headers: authHeaders(),
        });
        const fetchedMedia = response.data.media || [];
        setAllMedia(fetchedMedia);
        mediaToScan = fetchedMedia;
      }

      const imagesToScan = mediaToScan.filter((item) => item.isImage);
      const total = imagesToScan.length;
      setFaceScanningProgress({ current: 0, total });

      const matchedItems: MediaItem[] = [];
      let currentIdx = 0;

      for (const item of imagesToScan) {
        currentIdx++;
        setFaceScanningProgress({ current: currentIdx, total });
        setMessage(`Scanning photo ${currentIdx} of ${total}...`);

        try {
          const itemDescriptors = await extractFaceDescriptors(item.url);
          let isMatch = false;
          for (const desc of itemDescriptors) {
            const distance = compareFaces(selfieDescriptor, desc);
            console.log(`Euclidean distance for ${item.title}: ${distance}`);
            // Distance < 0.45 is a high-confidence match
            if (distance < 0.45) {
              isMatch = true;
              break;
            }
          }
          if (isMatch) {
            matchedItems.push(item);
          }
        } catch (err) {
          console.warn(`Could not analyze face for ${item.title}:`, err);
        }
      }

      setFaceMatches(matchedItems);
      if (matchedItems.length === 0) {
        setMessage("No matching photos found.");
      } else {
        setMessage(`Matched ${matchedItems.length} photo(s)!`);
      }
    } catch (error) {
      console.error("Browser face recognition error:", error);
      setMessage("Face recognition search failed.");
    } finally {
      setIsFaceSearching(false);
      setFaceScanningProgress(null);
    }
  };

  const filteredEvents = useMemo(() => {
    let list = searchResults ? searchResults.events : events;
    if (eventFilter === "public") {
      list = list.filter((e) => e.access === "public");
    } else if (eventFilter === "private") {
      list = list.filter((e) => e.access === "private");
    }
    return list;
  }, [events, searchResults, eventFilter]);

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
            {/* Left Column: Compact Grid Preview */}
            <div className="border-b border-neutral-200 p-5 md:border-b-0 md:border-r md:w-80 md:flex-shrink-0 flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Album</p>
                  <h2 className="text-lg font-semibold line-clamp-1">{selectedEvent.name}</h2>
                </div>
                <button onClick={closeAlbumPanel} className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition">
                  Close
                </button>
              </div>
              <p className="mt-3 text-xs text-neutral-500 line-clamp-2">{selectedEvent.description || "Browse the album."}</p>
              
              <div className="mt-5 grid grid-cols-3 gap-2 overflow-y-auto pr-1 max-h-[calc(100vh-250px)]">
                {filteredMedia.length === 0 ? (
                  <div className="col-span-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-neutral-400">
                    <p className="text-xs font-semibold">Empty</p>
                  </div>
                ) : (
                  filteredMedia.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveMediaIndex(index)}
                      className={`aspect-square w-full overflow-hidden rounded-xl border-2 transition relative ${
                        index === activeMediaIndex
                          ? "border-neutral-900 scale-95 shadow-sm"
                          : "border-transparent opacity-50 hover:opacity-100"
                      }`}
                    >
                      {item.mimeType.startsWith("video/") ? (
                        <video src={item.thumbnail} className="h-full w-full object-cover" />
                      ) : (
                        <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Side: Media Viewer & Detail Feed */}
            <div className="flex-1 overflow-hidden p-6 flex flex-col">
              {activeMedia ? (
                <div className="grid h-full gap-6 lg:grid-cols-[1.4fr_0.95fr] overflow-hidden">
                  {/* Photo Canvas with floating chevrons */}
                  <div className="relative rounded-2xl bg-neutral-950 overflow-hidden flex items-center justify-center group h-[400px] lg:h-full">
                    {activeMedia.mimeType.startsWith("video/") ? (
                      <video controls src={activeMedia.url} className="h-full w-full object-contain" />
                    ) : (
                      <img src={activeMedia.url} alt={activeMedia.title} className="h-full w-full object-contain" />
                    )}

                    {/* Floating Overlay Controls */}
                    <button
                      onClick={goToPreviousMedia}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-neutral-800 shadow-md backdrop-blur-sm hover:bg-white transition opacity-0 group-hover:opacity-100"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={goToNextMedia}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-neutral-800 shadow-md backdrop-blur-sm hover:bg-white transition opacity-0 group-hover:opacity-100"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Comments and Details Scroll Panel */}
                  <div className="flex flex-col h-full overflow-hidden justify-between pr-1">
                    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-320px)] flex-1 pr-1">
                      {/* Post Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-bold text-neutral-950">{activeMedia.title}</h3>
                          <p className="text-xs text-neutral-500">Uploaded by <span className="font-semibold text-neutral-800">{activeMedia.uploader}</span></p>
                        </div>
                        <Badge variant={activeMedia.access === "private" ? "secondary" : "default"}>{activeMedia.access}</Badge>
                      </div>

                      {/* Badges and Auto-Tag Option */}
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeMedia.tags.map((tag) => (
                            <span key={tag} className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide">
                              #{tag.toLowerCase()}
                            </span>
                          ))}
                        </div>
                        {canDeleteMedia && (
                          <Button
                            variant="outline"
                            onClick={() => handleAutoTag(activeMedia)}
                            disabled={isAutoTagging}
                            className="rounded-full text-xs font-bold text-indigo-750 border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 hover:text-indigo-850 hover:border-indigo-300 transition-all duration-200 px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className={`h-3.5 w-3.5 ${isAutoTagging ? "animate-spin text-indigo-500" : "text-amber-500 animate-pulse"}`} />
                            {isAutoTagging ? "Generating Tags..." : "Auto-Tag with AI"}
                          </Button>
                        )}
                      </div>

                      {/* Icons Action Row */}
                      <div className="flex items-center gap-5 py-2.5 border-y border-neutral-100 text-neutral-600">
                        <button onClick={() => handleLike(activeMedia)} className="flex items-center gap-1.5 hover:text-red-500 transition active:scale-95">
                          <Heart className={`h-5 w-5 ${activeMedia.likes > 0 ? "fill-red-500 text-red-500" : ""}`} />
                          <span className="text-xs font-bold">{activeMedia.likes}</span>
                        </button>
                        <button onClick={() => handleFavorite(activeMedia)} className="flex items-center gap-1.5 hover:text-amber-500 transition active:scale-95">
                          <Bookmark className={`h-5 w-5 ${activeMedia.favorites > 0 ? "fill-amber-500 text-amber-500" : ""}`} />
                          <span className="text-xs font-bold">{activeMedia.favorites}</span>
                        </button>
                        <button onClick={() => handleShare(activeMedia)} className="flex items-center gap-1.5 hover:text-emerald-500 transition active:scale-95">
                          <Send className="h-5 w-5" />
                          <span className="text-xs font-bold">{activeMedia.shares || 0}</span>
                        </button>
                        <a href={`/api/media/${activeMedia.id}/download?watermark=true${token ? `&token=${token}` : ""}`} className="flex items-center gap-1.5 hover:text-neutral-900 transition">
                          <Download className="h-5 w-5" />
                          <span className="text-xs font-bold">Save</span>
                        </a>

                        {canDeleteMedia && (
                          <button onClick={() => handleDeleteMedia(activeMedia)} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 transition">
                            <Trash2 className="h-4 w-4" />
                            <span className="text-xs font-bold">Delete</span>
                          </button>
                        )}
                      </div>

                      {activeMedia.taggedUsers && activeMedia.taggedUsers.length > 0 && (
                        <div className="text-xs text-neutral-500">
                          🏷️ Tagged: <span className="font-semibold text-neutral-700">{activeMedia.taggedUsers.join(", ")}</span>
                        </div>
                      )}

                      {/* Comments Feed */}
                      <div className="space-y-3 pt-2">
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Comments</p>
                        {activeMedia.comments && activeMedia.comments.length > 0 ? (
                          <div className="space-y-3">
                            {activeMedia.comments.map((comment) => (
                              <div key={comment.id} className="text-xs bg-neutral-50 rounded-2xl p-3 border border-neutral-100">
                                <p className="font-bold text-neutral-900 mb-0.5">{comment.author}</p>
                                <p className="text-neutral-700">{comment.text}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400 italic">No comments yet. Write a comment below to start the conversation.</p>
                        )}
                      </div>
                    </div>

                    {/* Unified Pill-shape Comment Input */}
                    <div className="space-y-2.5 pt-4 border-t border-neutral-100 bg-white">
                      <div className="relative flex items-center">
                        <input
                          value={commentDrafts[activeMedia.id] || ""}
                          onChange={(event) => setCommentDrafts((current) => ({ ...current, [activeMedia.id]: event.target.value }))}
                          placeholder="Write a comment..."
                          className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 pr-16 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleComment(activeMedia);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleComment(activeMedia)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-neutral-950 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-neutral-800 transition"
                        >
                          Send
                        </button>
                      </div>

                      <div className="relative flex items-center">
                        <input
                          value={tagDrafts[activeMedia.id] || ""}
                          onChange={(event) => setTagDrafts((current) => ({ ...current, [activeMedia.id]: event.target.value }))}
                          placeholder="Tag someone in this photo..."
                          className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 pr-16 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTagUser(activeMedia);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleTagUser(activeMedia)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-blue-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-blue-700 transition"
                        >
                          Tag
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[2rem] bg-neutral-50 p-6 text-center text-neutral-400">
                  <div>
                    <p className="text-lg font-semibold">No media selected</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex w-full">
        <aside className="flex flex-col gap-6 w-80 border-r border-neutral-200 bg-neutral-50/50 backdrop-blur-lg p-6 min-h-[calc(100vh-4rem)]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] font-bold text-neutral-450 mb-4 px-1">Menu</p>
            <div className="space-y-2.5">
              {[
                { label: "Events", icon: Calendar, view: "events" as const },
                { label: "Albums", icon: Image, view: "albums" as const },
                { label: "Upload", icon: Upload, view: "upload" as const },
                { label: "Discover", icon: Compass, view: "discover" as const },
                { label: "My Photos", icon: ScanFace, view: "personal" as const },
                { label: "Settings", icon: Settings, view: "settings" as const },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.view;
                return (
                  <button
                    key={item.label}
                    onClick={() => setActiveView(item.view)}
                    className={`group flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 relative overflow-hidden cursor-pointer ${
                      isActive 
                        ? "bg-neutral-900 text-white shadow-lg shadow-neutral-900/10 scale-[1.02] ring-1 ring-neutral-900" 
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50 hover:translate-x-1"
                    }`}
                  >
                    <div className={`rounded-xl p-1.5 transition-all duration-300 ${
                      isActive 
                        ? "bg-white/15 text-white" 
                        : "bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200/80 group-hover:text-neutral-800"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>


          <div className="rounded-[2rem] bg-white/75 border border-neutral-200 p-5 shadow-sm backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] font-bold text-neutral-450 mb-3">Sign in</p>
            {isClerkEnabled ? (
              <div className="space-y-4">
                <SignedIn>
                  <div className="flex flex-col items-center gap-3 py-3">
                    <UserButton afterSignOutUrl="/" showName />
                    <p className="text-xs text-neutral-500">Authenticated via Clerk</p>
                  </div>
                </SignedIn>
                <SignedOut>
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-xs text-neutral-500 text-center">Use the Clerk widget below to sign into your account.</p>
                    <SignInButton mode="modal">
                      <Button className="w-full">Sign In with Clerk</Button>
                    </SignInButton>
                  </div>
                </SignedOut>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 p-8 space-y-8">
          {activeView === "events" && (
            <>
              <section className="flex flex-col gap-4">
            {/* Sleek Gradient Hero Banner */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-850 p-8 text-white shadow-xl">
              {/* Subtle background abstract shapes */}
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100 backdrop-blur-md">
                    <Sparkles className="h-3 w-3 text-amber-300 animate-pulse" /> Live Dashboard
                  </span>
                  <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Events Dashboard</h2>
                  <p className="max-w-xl text-indigo-100 text-sm leading-relaxed">
                    Manage your event albums, coordinate uploads, configure access levels, and explore interactive media.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {canCreateEvent && (
                    <Button onClick={() => setShowCreateForm((value) => !value)} className="rounded-full bg-white text-indigo-900 hover:bg-indigo-50 shadow-lg hover:scale-105 active:scale-95 transition-all duration-200">
                      <Plus className="mr-1.5 h-4 w-4" />
                      New event
                    </Button>
                  )}
                </div>
              </div>

              {/* Glassmorphic Stats Section */}
              <div className="relative z-10 mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-md border border-white/10 hover:bg-white/15 transition duration-300">
                  <p className="text-indigo-200 text-xs font-semibold tracking-wider uppercase">Active Albums</p>
                  <p className="text-2xl font-bold mt-1">{events.length}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-md border border-white/10 hover:bg-white/15 transition duration-300">
                  <p className="text-indigo-200 text-xs font-semibold tracking-wider uppercase">Total Photos Shared</p>
                  <p className="text-2xl font-bold mt-1">{allMedia.length}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-md border border-white/10 hover:bg-white/15 transition duration-300">
                  <p className="text-indigo-200 text-xs font-semibold tracking-wider uppercase">Your Role</p>
                  <p className="text-2xl font-bold mt-1 capitalize">{user.role}</p>
                </div>
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
                  <div className="space-y-3 pt-2">
                    <label className="block text-sm font-semibold text-neutral-800">
                      Album Cover Image
                    </label>
                    <div className="flex gap-2 rounded-xl bg-neutral-100 p-1 border border-neutral-200/50 max-w-md">
                      {(["preset", "url", "upload"] as const).map((source) => (
                        <button
                          key={source}
                          type="button"
                          onClick={() => setCoverSource(source)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition ${
                            coverSource === source
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          {source === "preset" ? "Category Preset" : source === "url" ? "Custom URL" : "Upload File"}
                        </button>
                      ))}
                    </div>

                    {coverSource === "preset" && (
                      <div className="relative mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 max-w-sm aspect-video shadow-sm">
                        <img
                          src={CATEGORY_PRESETS[eventForm.category.toLowerCase()] || CATEGORY_PRESETS.music}
                          alt="Preset cover preview"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 rounded-lg bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                          Preset for {eventForm.category}
                        </div>
                      </div>
                    )}

                    {coverSource === "url" && (
                      <div className="space-y-2 max-w-md mt-2">
                        <Input
                          placeholder="https://images.unsplash.com/... or any image link"
                          value={customCoverUrl}
                          onChange={(e) => setCustomCoverUrl(e.target.value)}
                          className="text-xs"
                        />
                        {customCoverUrl.trim() && (
                          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 max-w-sm aspect-video shadow-sm">
                            <img
                              src={customCoverUrl}
                              alt="Custom URL cover preview"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?auto=format&fit=crop&q=80&w=800";
                              }}
                            />
                            <div className="absolute bottom-2 left-2 rounded-lg bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                              URL Preview
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {coverSource === "upload" && (
                      <div className="space-y-2 max-w-md mt-2">
                        <div className="relative flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl p-4 hover:bg-neutral-50 transition cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setCoverFile(file);
                                setCoverPreview(URL.createObjectURL(file));
                              }
                            }}
                          />
                          <div className="flex flex-col items-center gap-1.5 text-neutral-500">
                            <Upload className="h-6 w-6 text-neutral-400" />
                            <p className="text-xs font-medium text-neutral-700">
                              {coverFile ? coverFile.name : "Click or drag to choose cover image"}
                            </p>
                            <p className="text-[10px] text-neutral-400">PNG, JPG, or WEBP up to 5MB</p>
                          </div>
                        </div>
                        {coverPreview && (
                          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 max-w-sm aspect-video shadow-sm">
                            <img src={coverPreview} alt="Uploaded file preview" className="h-full w-full object-cover" />
                            <div className="absolute bottom-2 left-2 rounded-lg bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                              File Preview
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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

          <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200 pb-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-neutral-900">Event Library</h3>
                <p className="text-neutral-500 text-sm">Browse events by status and category.</p>
              </div>

              {/* Interactive Segmented Switchers */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Access Filter Tab */}
                <div className="flex rounded-full bg-neutral-100 p-1 border border-neutral-200/60 shadow-inner">
                  {(["all", "public", "private"] as const).map((filterOpt) => {
                    const isSel = eventFilter === filterOpt;
                    return (
                      <button
                        key={filterOpt}
                        onClick={() => setEventFilter(filterOpt)}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                          isSel
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-500 hover:text-neutral-800"
                        }`}
                      >
                        {filterOpt}
                      </button>
                    );
                  })}
                </div>

                {/* Sort Control Tab */}
                <div className="flex rounded-full bg-neutral-100 p-1 border border-neutral-200/60 shadow-inner">
                  {(["date", "name", "category"] as const).map((sortOpt) => {
                    const isSel = eventSort === sortOpt;
                    return (
                      <button
                        key={sortOpt}
                        onClick={() => setEventSort(sortOpt)}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                          isSel
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-500 hover:text-neutral-800"
                        }`}
                      >
                        {sortOpt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {filteredEvents.map((eventItem) => {
                const uniqueContributors = Array.from(new Set(allMedia.filter(m => m.eventId === eventItem.id).map(m => m.uploader)));
                return (
                  <Card
                    key={eventItem.id}
                    className="group overflow-hidden rounded-[2rem] border border-neutral-200 bg-white/70 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                    onClick={() => handleSelectEvent(eventItem)}
                  >
                    <div className="relative h-44 overflow-hidden bg-neutral-200">
                      <img 
                        src={eventItem.thumbnail} 
                        alt={eventItem.name} 
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-108" 
                      />
                      <div className="absolute left-3 top-3 rounded-full bg-neutral-900/50 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
                        {eventItem.access}
                      </div>
                      <div className="absolute left-3 bottom-3 rounded-full bg-black/40 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[0.7rem] font-semibold text-white uppercase tracking-wider">
                        {eventItem.category}
                      </div>
                      {user.role === "admin" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(eventItem);
                          }}
                          className="absolute right-3 top-3 rounded-full bg-rose-600 hover:bg-rose-700 p-2 text-white shadow-md hover:scale-105 active:scale-95 transition-all duration-200 border border-rose-500/20"
                          title="Delete Album"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <h4 className="font-semibold text-neutral-850 group-hover:text-indigo-600 transition-colors duration-250">{eventItem.name}</h4>
                        <p className="text-neutral-500 text-sm mt-0.5">{eventItem.date}</p>
                      </div>
                      <p className="text-neutral-500 text-sm line-clamp-2 leading-relaxed">{eventItem.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {eventItem.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-neutral-100 border border-neutral-200/40 px-2.5 py-0.5 text-[0.65rem] font-medium text-neutral-600">
                            #{tag}
                          </span>
                        ))}
                      </div>

                      {uniqueContributors.length > 0 && (
                        <div className="flex items-center gap-2 border-t border-neutral-100/80 pt-3 mt-2">
                          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-neutral-400">Contributors:</span>
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {uniqueContributors.slice(0, 3).map((name) => (
                              <div
                                key={name}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-neutral-100 text-[0.65rem] font-bold text-neutral-700 ring-2 ring-white uppercase shadow-sm border border-neutral-200/50"
                                title={name}
                              >
                                {name.slice(0, 2)}
                              </div>
                            ))}
                            {uniqueContributors.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-[0.6rem] font-bold text-white ring-2 ring-white shadow-sm">
                                +{uniqueContributors.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        className="w-full mt-2 rounded-full hover:bg-neutral-50 border-neutral-200 transition-all duration-200 group-hover:border-neutral-300"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectEvent(eventItem);
                        }}
                      >
                        View album
                      </Button>
                    </div>
                  </Card>
                );
              })}
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
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMedia.map((item) => (
                    <InstagramCard
                      key={item.id}
                      item={item}
                      user={user}
                      authHeaders={authHeaders}
                      onLike={handleLike}
                      onFavorite={handleFavorite}
                      onShare={handleShare}
                      onDelete={handleDeleteMedia}
                      canDelete={canDeleteMedia}
                    />
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
                    className={`block rounded-3xl border border-dashed p-6 text-center text-sm transition ${uploadProgress !== null ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"} ${dragActive ? "border-blue-500 bg-blue-50 text-blue-900" : "border-neutral-300 bg-neutral-100 text-neutral-600"}`}
                    onDragEnter={uploadProgress !== null ? undefined : handleDragEnter}
                    onDragOver={uploadProgress !== null ? undefined : handleDragEnter}
                    onDragLeave={uploadProgress !== null ? undefined : handleDragLeave}
                    onDrop={uploadProgress !== null ? undefined : handleDrop}
                  >
                    <div className="mb-3 text-neutral-500">
                      {uploadProgress !== null ? "Uploading in progress..." : "Choose files to upload"}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {uploadProgress !== null ? "Please wait while the transfer finishes." : "You can drag and drop photos or videos, or click to browse."}
                    </div>
                    <input type="file" multiple disabled={uploadProgress !== null} onChange={(event) => handleFilesChange(event.target.files)} className="hidden" />
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

                  {uploadProgress !== null && (
                    <div className="mt-4 space-y-2.5 rounded-3xl bg-neutral-50 border border-neutral-200/50 p-4 animate-fade-in shadow-inner">
                      <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                        <span className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                          </span>
                          Uploading {uploadFiles.length} file(s)...
                        </span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-neutral-200 h-3 rounded-full overflow-hidden border border-neutral-200 relative">
                        <div
                          className="bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-850 h-full transition-all duration-300 ease-out rounded-full relative overflow-hidden"
                          style={{ width: `${uploadProgress}%` }}
                        >
                          <div className="absolute inset-0 animate-shimmer" />
                        </div>
                      </div>
                    </div>
                  )}

                  <Button disabled={!selectedEvent || uploadFiles.length === 0 || uploadProgress !== null} onClick={handleUpload}>
                    {uploadProgress !== null ? "Uploading..." : "Upload files"}
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
                  {events.map((eventItem) => {
                    const uniqueContributors = Array.from(new Set(allMedia.filter(m => m.eventId === eventItem.id).map(m => m.uploader)));
                    return (
                      <Card 
                        key={eventItem.id} 
                        className="group overflow-hidden rounded-[2rem] border border-neutral-200 bg-white/70 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1" 
                        onClick={() => handleSelectEvent(eventItem)}
                      >
                        <div className="relative h-44 overflow-hidden bg-neutral-200">
                          <img 
                            src={eventItem.thumbnail} 
                            alt={eventItem.name} 
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-108" 
                          />
                          <div className="absolute left-3 top-3 rounded-full bg-neutral-900/50 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
                            {eventItem.access}
                          </div>
                          <div className="absolute left-3 bottom-3 rounded-full bg-black/40 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[0.7rem] font-semibold text-white uppercase tracking-wider">
                            {eventItem.category}
                          </div>
                          {user.role === "admin" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEvent(eventItem);
                              }}
                              className="absolute right-3 top-3 rounded-full bg-rose-600 hover:bg-rose-700 p-2 text-white shadow-md hover:scale-105 active:scale-95 transition-all duration-200 border border-rose-500/20"
                              title="Delete Album"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-neutral-850 group-hover:text-indigo-600 transition-colors duration-250">{eventItem.name}</h4>
                              <p className="text-neutral-500 text-sm mt-0.5">{albumCounts[eventItem.id] || 0} photos</p>
                            </div>
                          </div>
                          <p className="text-neutral-500 text-sm line-clamp-2 leading-relaxed">{eventItem.description}</p>
                          
                          {uniqueContributors.length > 0 && (
                            <div className="flex items-center gap-2 border-t border-neutral-100/80 pt-3 mt-2">
                              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-neutral-400">Contributors:</span>
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {uniqueContributors.slice(0, 3).map((name) => (
                                  <div
                                    key={name}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-neutral-100 text-[0.65rem] font-bold text-neutral-700 ring-2 ring-white uppercase shadow-sm border border-neutral-200/50"
                                    title={name}
                                  >
                                    {name.slice(0, 2)}
                                  </div>
                                ))}
                                {uniqueContributors.length > 3 && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-[0.6rem] font-bold text-white ring-2 ring-white shadow-sm">
                                    +{uniqueContributors.length - 3}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeView === "discover" && (
            <section className="space-y-8 animate-fade-in">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Discover</h2>
                  <p className="text-neutral-500 text-sm">Explore trending photographs and endless inspiration.</p>
                </div>
                <Button variant="outline" onClick={searchResults ? fetchAllMedia : handleRefreshDiscover} className="rounded-full shadow-sm">
                  {searchResults ? "Refresh results" : "Refresh gallery"}
                </Button>
              </div>

              {/* Browse by category */}
              {!searchResults && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-neutral-850 tracking-tight">Browse by category</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {DISCOVER_CATEGORIES.slice(0, showAllCategories ? DISCOVER_CATEGORIES.length : 10).map((cat) => {
                      const isActive = discoverCategory === cat.query;
                      return (
                        <button
                          key={cat.name}
                          onClick={() => handleCategorySelect(cat.query)}
                          className={`relative h-24 sm:h-28 overflow-hidden rounded-2xl group transition-all duration-300 ${
                            isActive
                              ? "ring-4 ring-neutral-900 ring-offset-2 scale-[0.98] shadow-lg"
                              : "hover:scale-[1.02] hover:shadow-md"
                          }`}
                        >
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className={`absolute inset-0 transition-colors duration-300 ${
                            isActive ? "bg-black/55" : "bg-black/40 group-hover:bg-black/50"
                          }`} />
                          <div className="absolute inset-0 flex items-center justify-center p-2">
                            <span className="text-white font-bold tracking-wide text-center text-sm sm:text-base drop-shadow-md">
                              {cat.name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => setShowAllCategories(!showAllCategories)}
                      className="px-6 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-full text-xs font-bold tracking-wide transition-all duration-200 shadow-sm border border-neutral-200"
                    >
                      {showAllCategories ? "See less" : "See more"}
                    </button>
                  </div>
                  
                  {discoverCategory && (
                    <div className="flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-3 mt-2 animate-fade-in">
                      <span className="text-sm text-neutral-600 font-medium">
                        Showing results for category: <span className="font-bold text-neutral-900 capitalize">#{discoverCategory}</span>
                      </span>
                      <button
                        onClick={() => handleCategorySelect(discoverCategory)}
                        className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-wider"
                      >
                        Clear category
                      </button>
                    </div>
                  )}
                </div>
              )}

              {searchResults ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {searchResults.media.map((item) => (
                    <InstagramCard
                      key={item.id}
                      item={item}
                      user={user}
                      authHeaders={authHeaders}
                      onLike={handleLike}
                      onFavorite={handleFavorite}
                      onShare={handleShare}
                      onDelete={handleDeleteMedia}
                      canDelete={canDeleteMedia || item.uploader === user.name}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                    {discoverMedia.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedDiscoverMedia(item)}
                        className="break-inside-avoid relative overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer group min-h-[280px]"
                      >
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5 text-white">
                          <p className="text-xs uppercase tracking-wider text-neutral-300 font-medium mb-1">Photographer</p>
                          <h4 className="font-semibold text-sm leading-tight mb-2 truncate">{item.uploader}</h4>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {item.tags.map(tag => (
                              <span key={tag} className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                #{tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-xs">
                                <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                                {item.likes}
                              </span>
                              <span className="flex items-center gap-1 text-xs">
                                <Bookmark className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                {item.favorites}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-neutral-200">View Detail</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Infinite Scroll trigger / loading indicator */}
                  <div id="discover-sentinel" className="flex justify-center py-8">
                    {isFetchingDiscover && (
                      <div className="flex items-center gap-2 text-neutral-500 text-sm font-medium bg-neutral-50 border border-neutral-200 rounded-full px-5 py-2.5 shadow-sm animate-pulse">
                        <svg className="animate-spin h-4 w-4 text-neutral-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Discovering more photos...
                      </div>
                    )}
                    {!hasMoreDiscover && (
                      <div className="text-xs text-neutral-400 font-semibold uppercase tracking-wider bg-neutral-50 border border-neutral-100 rounded-full px-6 py-2.5">
                        ✨ You have reached the end of inspiration ✨
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {activeView === "personal" && (
            <section className="space-y-8 animate-fade-in">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight">My Photos</h2>
                  <p className="text-neutral-500 text-sm">Find all uploaded photos containing your face using local facial recognition.</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {/* Reference Selfie Upload/Preview Card */}
                <Card className="p-6 md:col-span-1 flex flex-col justify-between h-fit">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-neutral-805">Reference Selfie</h3>
                    {referenceSelfie ? (
                      <div className="relative rounded-2xl overflow-hidden aspect-square border border-neutral-200 shadow-sm bg-neutral-100 flex items-center justify-center">
                        <img
                          src={referenceSelfie}
                          alt="Reference Selfie"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 aspect-square flex flex-col items-center justify-center p-6 text-center text-neutral-500">
                        <ScanFace className="h-10 w-10 text-neutral-400 mb-3 animate-pulse" />
                        <p className="text-xs font-medium">No reference selfie uploaded yet</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6">
                    <label className="block w-full text-center">
                      <span className="inline-flex w-full justify-center items-center gap-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2.5 text-xs font-semibold shadow-sm transition-all duration-200 cursor-pointer">
                        <Upload className="h-3.5 w-3.5" />
                        {referenceSelfie ? "Scan New Selfie" : "Upload Selfie to Scan"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleFaceMatch(event.target.files)}
                        className="hidden"
                        disabled={isFaceSearching}
                      />
                    </label>
                  </div>
                </Card>

                {/* Progress / Status Card */}
                <Card className="p-6 md:col-span-2 h-fit flex flex-col justify-center">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-neutral-805">Scan Status</h3>
                    
                    {isFaceSearching ? (
                      <div className="space-y-4 py-2">
                        <div className="flex justify-between text-xs font-bold text-neutral-700">
                          <span>{message || "Scanning in progress..."}</span>
                          {faceScanningProgress && (
                            <span>
                              {Math.round((faceScanningProgress.current / faceScanningProgress.total) * 100)}%
                            </span>
                          )}
                        </div>
                        {faceScanningProgress && (
                          <div className="w-full bg-neutral-200 h-3 rounded-full overflow-hidden border border-neutral-200">
                            <div
                              className="bg-neutral-900 h-full transition-all duration-300 rounded-full"
                              style={{
                                width: `${(faceScanningProgress.current / faceScanningProgress.total) * 100}%`
                              }}
                            />
                          </div>
                        )}
                        <p className="text-neutral-500 text-xs italic">
                          This runs entirely in your browser using Client-Side Face Recognition (face-api.js).
                        </p>
                      </div>
                    ) : faceMatches.length > 0 ? (
                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5 space-y-2">
                        <div className="text-neutral-800 font-bold text-lg">
                          🎉 Found {faceMatches.length} matching photo(s)!
                        </div>
                        <p className="text-sm text-neutral-500">
                          Review the matching photos below. You can view, comment, or like them directly.
                        </p>
                      </div>
                    ) : referenceSelfie ? (
                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5 space-y-2">
                        <div className="text-neutral-800 font-bold text-lg">
                          🔍 No matching photos found.
                        </div>
                        <p className="text-sm text-neutral-500">
                          Try uploading a clearer selfie in different lighting or upload more group photos to the events.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5 space-y-2">
                        <div className="text-neutral-800 font-bold text-lg">
                          👋 Ready to find your photos?
                        </div>
                        <p className="text-sm text-neutral-500">
                          To get started, click the "Upload Selfie" button to upload a clear front-facing photograph of yourself.
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Matched Photos Grid */}
              {faceMatches.length > 0 && (
                <div className="space-y-6 pt-4">
                  <h3 className="text-xl font-bold text-neutral-850 tracking-tight">Matching Photos</h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {faceMatches.map((item) => (
                      <InstagramCard
                        key={item.id}
                        item={item}
                        user={user}
                        authHeaders={authHeaders}
                        onLike={handleLike}
                        onFavorite={handleFavorite}
                        onShare={handleShare}
                        onDelete={handleDeleteMedia}
                        canDelete={canDeleteMedia || item.uploader === user.name}
                      />
                    ))}
                  </div>
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
                        className={`block rounded-3xl border border-dashed p-6 text-center text-sm transition ${uploadProgress !== null ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"} ${dragActive ? "border-blue-500 bg-blue-50 text-blue-900" : "border-neutral-300 bg-neutral-100 text-neutral-600"}`}
                        onDragEnter={uploadProgress !== null ? undefined : handleDragEnter}
                        onDragOver={uploadProgress !== null ? undefined : handleDragEnter}
                        onDragLeave={uploadProgress !== null ? undefined : handleDragLeave}
                        onDrop={uploadProgress !== null ? undefined : handleDrop}
                      >
                        <div className="mb-3 text-neutral-500">
                          {uploadProgress !== null ? "Uploading in progress..." : "Choose files to upload"}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {uploadProgress !== null ? "Please wait while the transfer finishes." : "You can drag and drop photos or videos, or click to browse."}
                        </div>
                        <input type="file" multiple disabled={uploadProgress !== null} onChange={(event) => handleFilesChange(event.target.files)} className="hidden" />
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

                      {uploadProgress !== null && (
                        <div className="mt-4 space-y-2.5 rounded-3xl bg-neutral-50 border border-neutral-200/50 p-4 animate-fade-in shadow-inner">
                          <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                            <span className="flex items-center gap-2">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                              </span>
                              Uploading {uploadFiles.length} file(s)...
                            </span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-neutral-200 h-3 rounded-full overflow-hidden border border-neutral-200 relative">
                            <div
                              className="bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-850 h-full transition-all duration-300 ease-out rounded-full relative overflow-hidden"
                              style={{ width: `${uploadProgress}%` }}
                            >
                              <div className="absolute inset-0 animate-shimmer" />
                            </div>
                          </div>
                        </div>
                      )}

                      <Button disabled={!selectedEvent || uploadFiles.length === 0 || uploadProgress !== null} onClick={handleUpload}>
                        {uploadProgress !== null ? "Uploading..." : "Upload files"}
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
