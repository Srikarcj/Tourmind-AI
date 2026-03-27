"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { fetchNotifications, markNotificationRead } from "@/lib/api";
import { NotificationItem } from "@/lib/types";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading, getAccessToken } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
      return;
    }

    if (!user) {
      return;
    }

    let active = true;

    const run = async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Session expired.");
        }

        const data = await fetchNotifications(token, 80);

        if (active) {
          setItems(data);
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to fetch notifications.");
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [getAccessToken, loading, router, user]);

  const handleMarkRead = async (id: string) => {
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Session expired.");
      }

      const updated = await markNotificationRead(token, id);
      setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Unable to mark notification as read.");
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="glass-card mesh-bg p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-base/55">Updates</p>
        <h1 className="mt-2 text-3xl font-semibold text-base">Notifications</h1>
      </section>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-base/15 bg-white p-4 text-sm text-base/70">No notifications yet.</p>
        ) : (
          items.map(item => (
            <article key={item.id} className="rounded-xl border border-base/15 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-base">{item.title}</p>
                  <p className="mt-1 text-sm text-base/75">{item.message}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.08em] text-base/55">
                    {item.type} | {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                {!item.isRead && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(item.id)}
                    className="rounded-full border border-base/25 px-3 py-1 text-xs font-semibold text-base/80 transition hover:bg-base hover:text-white"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}


