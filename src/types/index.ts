
interface PeerServMessage {
  messageId: number;
  body: string;
  sender: string;
  created_at: string;
  updated_at: string;
}

interface TokenatorConfig {
  peerServHost?: string;
  clientPrivateKey?: string;
}

interface MessageParams {
  onMessage: (message: PeerServMessage) => void;
  messageBox: string;
  autoAcknowledge?: boolean;
}

interface SendMessageParams {
  body: string;
  messageBox: string;
  recipient: string;
}

interface Message {
  recipient: string;
  messageBox: string;
  body: string | object;
  messageId?: string;
}

interface MessageBox {
  messageBox: string;
}

interface AcknowledgeMessageParams {
  messageIds: number[];
}
