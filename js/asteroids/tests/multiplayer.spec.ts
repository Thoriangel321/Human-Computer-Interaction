import { expect, test } from '@playwright/test';

test.describe('Multiplayer room synchronization and chat', () => {
  test('second browser sees first player movement and receives chat messages', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageB.goto('/');

    await pageA.fill('#player-name', 'Alice');
    await pageA.click('#join-btn');
    await expect(pageA.locator('#game-container')).toBeVisible();

    await pageB.fill('#player-name', 'Bob');
    await pageB.click('#join-btn');
    await expect(pageB.locator('#game-container')).toBeVisible();

    // Очікуємо системне повідомлення про вхід обох гравців у кімнату
    await expect(pageB.locator('#chat-messages')).toContainText('Player [Bob] joined', { timeout: 10000 });

    // Фіксуємо початкові позиції кораблів у клієнті Bob
    const initialShips = await pageB.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice(0, 16));
    });
    expect(initialShips).not.toBeNull();

    // Надсилаємо повідомлення в чат від першого браузера та перевіряємо у другому
    await pageA.fill('#chat-input', 'Hello from Alice!');
    await pageA.click('#chat-send');
    await expect(pageB.locator('#chat-messages')).toContainText('Alice: Hello from Alice!', {
      timeout: 10000
    });

    // Керуємо кораблем у першому браузері (розгін + поворот)
    const canvasBeforeMove = await pageB.locator('#game-canvas').screenshot();

    await pageA.keyboard.down('KeyW');
    await pageA.keyboard.down('KeyD');
    await pageA.waitForTimeout(850);
    await pageA.keyboard.up('KeyD');
    await pageA.keyboard.up('KeyW');

    await pageB.waitForTimeout(350);
    const canvasAfterMove = await pageB.locator('#game-canvas').screenshot();

    // Кадр у другому браузері змінився внаслідок руху корабля першого гравця
    expect(Buffer.compare(canvasBeforeMove, canvasAfterMove)).not.toBe(0);

    await contextA.close();
    await contextB.close();
  });
});