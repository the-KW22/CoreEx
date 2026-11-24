import { proxyChatStream } from "@/lib/chat-proxy";

export async function POST(request: Request, { params }: RouteContext<"/chat-stream/[id]/answer">) {
  return proxyChatStream(request, (await params).id, "answer");
}
