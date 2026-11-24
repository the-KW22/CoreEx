import { proxyChatStream } from "@/lib/chat-proxy";

export async function POST(request: Request, { params }: RouteContext<"/chat-stream/[id]">) {
  return proxyChatStream(request, (await params).id, "messages");
}
