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
  Heart,
  Bookmark,
  Send,
  Download,
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
import { loadFaceModels, extractFaceDescriptor, compareFaces } from "./lib/face-recognition";

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
const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || "BGaXQJqwEAlf6Qie0mK_FmReMW0nIny93Scau7K85HHCOilovUbhcOr-ZajkmX4B8NZg-VbjcZ2zrReMA-Wh44Q";

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

  // Clerk Auth Integration
  const clerk = isClerkEnabled ? useUser() : null;
  const clerkAuth = isClerkEnabled ? useAuth() : null;

  useEffect(() => {
    fetchEvents("date");
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
    setMessage("Loading Face Recognition neural network...");

    try {
      // Load face-api models
      await loadFaceModels();
      setMessage("Extracting face features from selfie...");

      const selfieFile = files[0];
      const selfieUrl = URL.createObjectURL(selfieFile);
      const selfieDescriptor = await extractFaceDescriptor(selfieUrl);

      if (!selfieDescriptor) {
        setMessage("Unable to detect a face in your selfie. Please try a clearer picture.");
        setIsFaceSearching(false);
        return;
      }

      setMessage("Scanning album photos. This runs fully in your browser...");
      const currentMediaList = selectedEvent ? media : allMedia;
      const matchedItems: MediaItem[] = [];

      for (const item of currentMediaList) {
        if (!item.isImage) continue;
        try {
          const itemDescriptor = await extractFaceDescriptor(item.url);
          if (itemDescriptor) {
            const distance = compareFaces(selfieDescriptor, itemDescriptor);
            console.log(`Euclidean distance for ${item.title}: ${distance}`);
            // Distance < 0.6 is a positive match
            if (distance < 0.6) {
              matchedItems.push(item);
            }
          }
        } catch (err) {
          console.warn(`Could not analyze face for ${item.title}:`, err);
        }
      }

      setFaceMatches(matchedItems);
      if (matchedItems.length === 0) {
        setMessage("No matching photos found in this album.");
      } else {
        setMessage(`Matched ${matchedItems.length} photo(s)!`);
      }
    } catch (error) {
      console.error("Browser face recognition error:", error);
      setMessage("Face recognition search failed.");
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

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeMedia.tags.map((tag) => (
                          <span key={tag} className="text-xs font-medium text-blue-600">
                            #{tag.toLowerCase()}
                          </span>
                        ))}
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
                        <a href={`/api/media/${activeMedia.id}/download?watermark=true`} className="flex items-center gap-1.5 hover:text-neutral-900 transition">
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
        <aside className="flex flex-col gap-6 w-80">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-3">Menu</p>
            <div className="space-y-2">
              {[
                { label: "Events", icon: Calendar, view: "events" as const },
                { label: "Albums", icon: Image, view: "albums" as const },
                { label: "Upload", icon: Upload, view: "upload" as const },
                { label: "Discover", icon: Compass, view: "discover" as const },
                { label: "Settings", icon: Settings, view: "settings" as const },
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
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {(searchResults ? searchResults.media : allMedia).slice(0, 9).map((item) => (
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
