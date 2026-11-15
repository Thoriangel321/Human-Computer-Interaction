import { z } from 'zod';

const RoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive()
});

const RoomListSchema = z.array(RoomSummarySchema);

export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export interface JoinRequest {
  readonly roomId: string;
  readonly playerName: string;
}

export class Lobby {
  private readonly container: HTMLElement;
  private readonly roomListEl: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly statusEl: HTMLElement;

  private selectedRoomId = 'room1';
  private onJoinCallback: ((req: JoinRequest) => void) | null = null;

  constructor() {
    const container = document.getElementById('lobby');
    const roomListEl = document.getElementById('room-list');
    const nameInput = document.getElementById('player-name');
    const joinBtn = document.getElementById('join-btn');
    const statusEl = document.getElementById('lobby-status');

    if (
      !(container instanceof HTMLElement) ||
      !(roomListEl instanceof HTMLElement) ||
      !(nameInput instanceof HTMLInputElement) ||
      !(joinBtn instanceof HTMLButtonElement) ||
      !(statusEl instanceof HTMLElement)
    ) {
      throw new Error('Lobby DOM elements are missing or have invalid tags');
    }

    this.container = container;
    this.roomListEl = roomListEl;
    this.nameInput = nameInput;
    this.joinBtn = joinBtn;
    this.statusEl = statusEl;

    this.joinBtn.addEventListener('click', () => this.submitJoin());
    this.nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.submitJoin();
    });
  }

  public onJoin(callback: (req: JoinRequest) => void): void {
    this.onJoinCallback = callback;
  }

  public show(): void {
    this.container.style.display = 'flex';
    void this.fetchRooms();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private async fetchRooms(): Promise<void> {
    try {
      const response = await fetch('/api/rooms');
      if (!response.ok) {
        this.renderFallbackRooms();
        return;
      }

      const rawJson: unknown = await response.json();
      const parsed = RoomListSchema.safeParse(rawJson);
      if (!parsed.success || parsed.data.length === 0) {
        this.renderFallbackRooms();
        return;
      }

      this.renderRooms(parsed.data);
    } catch {
      this.renderFallbackRooms();
    }
  }

  private renderFallbackRooms(): void {
    this.renderRooms([
      { id: 'room1', name: 'Node.js Arena', players: 0, maxPlayers: 4 },
      { id: 'room2', name: 'Asteroid Belt', players: 0, maxPlayers: 8 }
    ]);
  }

  private renderRooms(rooms: readonly RoomSummary[]): void {
    this.roomListEl.innerHTML = '';

    const firstRoom = rooms[0];
    if (firstRoom && !rooms.some((r) => r.id === this.selectedRoomId)) {
      this.selectedRoomId = firstRoom.id;
    }

    for (const room of rooms) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `room-item${room.id === this.selectedRoomId ? ' selected' : ''}`;
      item.textContent = `${room.name} (${room.players}/${room.maxPlayers})`;

      item.addEventListener('click', () => {
        this.selectedRoomId = room.id;
        this.renderRooms(rooms);
      });

      this.roomListEl.appendChild(item);
    }
  }

  private submitJoin(): void {
    const trimmed = this.nameInput.value.trim();
    const playerName = trimmed.length > 0 ? trimmed : `Pilot-${Math.floor(100 + Math.random() * 900)}`;
    this.statusEl.textContent = '';

    if (this.onJoinCallback) {
      this.onJoinCallback({
        roomId: this.selectedRoomId,
        playerName
      });
    }
  }
}