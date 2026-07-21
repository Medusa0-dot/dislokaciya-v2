// === SERVICE WORKER ДЛЯ ДИСЛОКАЦИИ ВБФ v2 ===
const CACHE_NAME = 'dislokaciya-v2';

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker установлен');
  self.skipWaiting();
});

// Активация
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker активирован');
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

// === BACKGROUND SYNC ===
self.addEventListener('sync', (event) => {
  console.log('🔄 Background Sync запущен, тег:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(sendQueuedData());
  }
});

async function sendQueuedData() {
  console.log('📤 Начинаем отправку очереди...');
  
  const API_URL = 'https://script.google.com/macros/s/AKfycbzd7UJQps6jw06rvI32th3I9NnCyl5UBxzlsuosvhaxviQAPR0r_xmlvG5oxTlEXZ26/exec';
  
  // Получаем очередь из IndexedDB
  const db = await openDB();
  const queue = await getQueueFromDB(db);
  
  console.log('📋 В очереди:', queue.length, 'записей');
  
  if (!queue.length) {
    console.log('✅ Очередь пуста');
    return;
  }
  
  let sentCount = 0; // ВАЖНО: let, а не const!
  
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    try {
      const formData = new FormData();
      formData.append('data', JSON.stringify(entry));
      
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        sentCount++;
        console.log(`✅ Отправлено ${i + 1} из ${queue.length}`);
      } else {
        console.log('❌ Ошибка сервера:', response.status);
        break;
      }
    } catch (err) {
      console.log('❌ Ошибка сети:', err);
      break;
    }
  }
  
  // Удаляем отправленные из очереди
  if (sentCount > 0) {
    const remaining = queue.slice(sentCount);
    await saveQueueToDB(db, remaining);
    console.log(`✅ Отправлено: ${sentCount}, осталось: ${remaining.length}`);
    
    // Уведомление пользователю
    self.registration.showNotification('✅ Отчёты отправлены', {
      body: `Успешно отправлено: ${sentCount} отчёт(ов)`,
      icon: './logo.png',
      badge: './logo.png',
      vibrate: [200, 100, 200],
      tag: 'sync-complete',
      requireInteraction: false
    });
    
    // Сообщаем основной странице
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ 
          type: 'sync-complete', 
          sentCount: sentCount 
        });
      });
    });
  }
}

// === Вспомогательные функции для IndexedDB ===
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dislokaciya-db', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getQueueFromDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const store = tx.objectStore('queue');
    const request = store.get('queue-data');
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveQueueToDB(db, queue) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    const store = tx.objectStore('queue');
    store.put(queue, 'queue-data');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// === Push-уведомления ===
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { 
    title: 'Дислокация ВБФ', 
    body: 'Сеть появилась!' 
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './logo.png',
      badge: './logo.png',
      vibrate: [200, 100, 200],
      tag: 'network-status',
      requireInteraction: false
    })
  );
});

// Клик по уведомлению — открывает приложение
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let client of clientList) {
        if (client.url.includes('dislokaciya') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('./');
    })
  );
});
