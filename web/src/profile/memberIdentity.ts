import { useUserSession } from "@/user/UserSessionContext";

export function useCaddieMemberId(): string | undefined {
  const { session } = useUserSession();
  // For now, we just map user session ID → memberId; later we can
  // upgrade this to a real account/member ID when we have auth.
  return session?.userId;
}
