import type { CommunicationThread, CommunicationMessage } from "./types";

function relDate(daysAgo: number): string {
  return new Date(Date.now() + daysAgo * 86400000).toISOString();
}

// ============================================================
// Lead 1: Sarah Chen at US Foods
// ============================================================

const lead1EmailThread: CommunicationThread = {
  id: "thread-l1-email-1",
  leadId: "lead-1",
  channel: "email",
  subject: "D&D Calculator for US Foods Distribution",
  lastMessageDate: relDate(-1),
  unreadCount: 0,
  messages: [
    {
      id: "msg-l1-e1",
      leadId: "lead-1",
      channel: "email",
      direction: "outbound",
      subject: "D&D Calculator for US Foods Distribution",
      body: "Hi Sarah,\n\nI noticed US Foods has been expanding its distribution network. We built a Damage & Delay calculator that typically saves food distributors 12-18% on logistics waste.\n\nWould you have 15 minutes this week to see a quick demo?\n\nBest,\nBalboa Sales Team",
      date: relDate(-5),
      status: "read",
      threadId: "thread-l1-email-1",
      sender: "Balboa Team",
    },
    {
      id: "msg-l1-e2",
      leadId: "lead-1",
      channel: "email",
      direction: "inbound",
      subject: "Re: D&D Calculator for US Foods Distribution",
      body: "Hi,\n\nThanks for reaching out. We are actually evaluating tools like this right now. Can you send over some more details on how the calculator works with perishable goods specifically?\n\nSarah",
      date: relDate(-3),
      status: "replied",
      threadId: "thread-l1-email-1",
      sender: "Sarah Chen",
    },
    {
      id: "msg-l1-e3",
      leadId: "lead-1",
      channel: "email",
      direction: "outbound",
      subject: "Re: D&D Calculator for US Foods Distribution",
      body: "Sarah,\n\nGreat to hear! I have attached our perishable goods case study with Sysco. The calculator handles temperature-sensitive SKUs with real-time tracking integration.\n\nKey highlights:\n- 14% reduction in spoilage claims\n- Real-time temperature deviation alerts\n- Automated carrier scorecards\n\nWould Thursday at 2pm work for a quick walkthrough?\n\nBest,\nBalboa Sales Team",
      date: relDate(-1),
      status: "delivered",
      threadId: "thread-l1-email-1",
      sender: "Balboa Team",
    },
  ],
};

const lead1LinkedInThread: CommunicationThread = {
  id: "thread-l1-li-1",
  leadId: "lead-1",
  channel: "linkedin",
  subject: "MODEX 2026 Connection",
  lastMessageDate: relDate(-2),
  unreadCount: 1,
  messages: [
    {
      id: "msg-l1-li1",
      leadId: "lead-1",
      channel: "linkedin",
      direction: "outbound",
      body: "Hi Sarah, saw you are attending MODEX next month. We are exhibiting at booth 4412 and would love to show you our D&D calculator in action. Let me know if you want to schedule a meeting!",
      date: relDate(-4),
      status: "read",
      threadId: "thread-l1-li-1",
      sender: "Balboa Team",
    },
    {
      id: "msg-l1-li2",
      leadId: "lead-1",
      channel: "linkedin",
      direction: "inbound",
      body: "Thanks! Yes I will be at MODEX. Let us connect there. I will have our logistics director with me too.",
      date: relDate(-2),
      status: "replied",
      threadId: "thread-l1-li-1",
      sender: "Sarah Chen",
    },
  ],
};

const lead1SmsThread: CommunicationThread = {
  id: "thread-l1-sms-1",
  leadId: "lead-1",
  channel: "sms",
  subject: undefined,
  lastMessageDate: relDate(-1),
  unreadCount: 0,
  messages: [
    {
      id: "msg-l1-sms1",
      leadId: "lead-1",
      channel: "sms",
      direction: "outbound",
      body: "Hi Sarah, this is Balboa. Just sent you the perishable goods case study via email. Let me know if Thursday 2pm works for a demo!",
      date: relDate(-1),
      status: "delivered",
      threadId: "thread-l1-sms-1",
      sender: "Balboa Team",
    },
  ],
};

const lead1WhatsAppThread: CommunicationThread = {
  id: "thread-l1-wa-1",
  leadId: "lead-1",
  channel: "whatsapp",
  subject: undefined,
  lastMessageDate: relDate(0),
  unreadCount: 1,
  messages: [
    {
      id: "msg-l1-wa1",
      leadId: "lead-1",
      channel: "whatsapp",
      direction: "outbound",
      body: "Hi Sarah! Quick follow up on our email thread. I have the MODEX meeting link ready for you. Want me to send it over?",
      date: relDate(-1),
      status: "read",
      threadId: "thread-l1-wa-1",
      sender: "Balboa Team",
    },
    {
      id: "msg-l1-wa2",
      leadId: "lead-1",
      channel: "whatsapp",
      direction: "inbound",
      body: "Yes please! Also can you include the agenda? I want to share it with my director before the meeting.",
      date: relDate(0),
      status: "replied",
      threadId: "thread-l1-wa-1",
      sender: "Sarah Chen",
    },
  ],
};

// ============================================================
// Lead 2: Marcus Rodriguez at Performance Food Group
// ============================================================

const lead2EmailThread: CommunicationThread = {
  id: "thread-l2-email-1",
  leadId: "lead-2",
  channel: "email",
  subject: "Reducing D&D Claims at Performance Food Group",
  lastMessageDate: relDate(-3),
  unreadCount: 0,
  messages: [
    {
      id: "msg-l2-e1",
      leadId: "lead-2",
      channel: "email",
      direction: "outbound",
      subject: "Reducing D&D Claims at Performance Food Group",
      body: "Hi Marcus,\n\nI came across Performance Food Group's recent expansion into the Southeast region. Congrats on the growth!\n\nWe have been helping food distributors reduce damage and delay claims by an average of 15%. Given your scale, I think there is a meaningful opportunity here.\n\nWould you be open to a 15-minute intro call?\n\nBest,\nBalboa Sales Team",
      date: relDate(-7),
      status: "read",
      threadId: "thread-l2-email-1",
      sender: "Balboa Team",
    },
    {
      id: "msg-l2-e2",
      leadId: "lead-2",
      channel: "email",
      direction: "inbound",
      subject: "Re: Reducing D&D Claims at Performance Food Group",
      body: "Thanks for reaching out. We are currently locked into a contract with our existing provider through Q3, but I would be happy to learn more for when we evaluate alternatives. Can you send a one-pager?\n\nMarcus",
      date: relDate(-3),
      status: "replied",
      threadId: "thread-l2-email-1",
      sender: "Marcus Rodriguez",
    },
  ],
};

const lead2LinkedInThread: CommunicationThread = {
  id: "thread-l2-li-1",
  leadId: "lead-2",
  channel: "linkedin",
  subject: "Connection Request",
  lastMessageDate: relDate(-6),
  unreadCount: 0,
  messages: [
    {
      id: "msg-l2-li1",
      leadId: "lead-2",
      channel: "linkedin",
      direction: "outbound",
      body: "Hi Marcus, great to connect! Saw your post about cold chain innovation. Would love to exchange ideas on reducing logistics waste in food distribution.",
      date: relDate(-6),
      status: "delivered",
      threadId: "thread-l2-li-1",
      sender: "Balboa Team",
    },
  ],
};

// ============================================================
// Exported mock data
// ============================================================

export const mockCommunications: Record<string, CommunicationThread[]> = {
  "lead-1": [
    lead1EmailThread,
    lead1LinkedInThread,
    lead1SmsThread,
    lead1WhatsAppThread,
  ],
  "lead-2": [lead2EmailThread, lead2LinkedInThread],
};
