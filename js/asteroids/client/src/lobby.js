export class Lobby extends EventTarget {
  constructor() {
    super();
    this.screen = document.getElementById('lobby-screen');
    this.roomsList = document.getElementById('rooms-list');
    this.joinBtn = document.getElementById('join-btn');
    this.nameInput = document.getElementById('player-name-input');
    
    this.selectedRoomId = null;
    this.pollInterval = null;
    this.abortController = null;
    
    this.joinBtn.addEventListener('click', () => this.handleJoin());
  }

  show() {
    this.screen.style.display = 'flex';
    this.startPolling();
  }

  hide() {
    this.screen.style.display = 'none';
    this.stopPolling();
  }

  startPolling() {
    this.stopPolling(); 
    this.fetchRooms();
    this.pollInterval = setInterval(() => this.fetchRooms(), 2000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async fetchRooms() {
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    try {

      const timeoutSignal = AbortSignal.timeout(1000);
      const combinedSignal = AbortSignal.any([this.abortController.signal, timeoutSignal]);

      const response = await fetch('/api/rooms.json', { signal: combinedSignal });
      
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const rooms = await response.json();
      
      this.renderRooms(rooms);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Lobby polling error:', error.message);
        if (!this.selectedRoomId) {
            this.roomsList.innerHTML = '<li style="color: red;">Error loading rooms. Retrying...</li>';
        }
      }
    }
  }

  renderRooms(rooms) {
    this.roomsList.innerHTML = '';
    
    if (rooms.length === 0) {
      this.roomsList.innerHTML = '<li>No active rooms.</li>';
      return;
    }

    rooms.forEach(room => {
      const li = document.createElement('li');
      li.style.padding = '8px';
      li.style.cursor = 'pointer';
      li.style.borderBottom = '1px solid #222';
      li.textContent = `${room.name} (${room.players}/${room.maxPlayers})`;
      
      if (this.selectedRoomId === room.id) {
        li.style.background = '#0a2520';
        li.style.border = '1px solid #00ffcc';
      }

      li.addEventListener('click', () => {
        this.selectedRoomId = room.id;
        this.renderRooms(rooms); 
        this.updateJoinButton();
      });

      this.roomsList.appendChild(li);
    });
  }

  updateJoinButton() {
    if (this.selectedRoomId && this.nameInput.value.trim() !== '') {
      this.joinBtn.disabled = false;
      this.joinBtn.style.color = '#000';
      this.joinBtn.style.background = '#00ffcc';
    } else {
      this.joinBtn.disabled = true;
      this.joinBtn.style.color = '#555';
      this.joinBtn.style.background = '#222';
    }
  }

  handleJoin() {
    const playerName = this.nameInput.value.trim();
    if (!this.selectedRoomId || !playerName) return;

    this.stopPolling();
    
    this.dispatchEvent(new CustomEvent('join', {
      detail: {
        roomId: this.selectedRoomId,
        playerName: playerName
      }
    }));
  }
}