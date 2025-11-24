// Глобальные переменные
let currentUser = null;
let currentUserData = null;
let currentChat = null;
let usersCache = new Map();
let chatsListener = null;
let messagesListener = null;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    initAuth();
    initEventListeners();
});

// Инициализация темы
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton(savedTheme);
}

function updateThemeButton(theme) {
    const button = document.getElementById('theme-toggle');
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Инициализация аутентификации
function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserProfile(user.uid);
            showMainApp();
            loadChats();
        } else {
            showAuth();
        }
    });
}

// Инициализация обработчиков событий
function initEventListeners() {
    // Переключение темы
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Ввод сообщения по Enter
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Загрузка аватара
    document.getElementById('avatar-input').addEventListener('change', handleAvatarUpload);
    
    // Поиск по Enter
    document.getElementById('search-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchUsers();
        }
    });
    
    // Закрытие модального окна по клику вне его
    document.getElementById('new-chat-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeNewChatModal();
        }
    });
}

// Переключение темы
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton(newTheme);
}

// Показать форму аутентификации
function showAuth() {
    document.getElementById('auth-section').classList.add('active');
    document.getElementById('main-section').classList.remove('active');
    showForm('login');
}

// Показать основное приложение
function showMainApp() {
    document.getElementById('auth-section').classList.remove('active');
    document.getElementById('main-section').classList.add('active');
}

// Переключение между формами входа/регистрации
function showForm(formType) {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById(formType + '-form').classList.add('active');
}

// Регистрация
async function register() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm').value;

    if (!email || !password) {
        alert('Заполните все поля');
        return;
    }

    if (password !== confirmPassword) {
        alert('Пароли не совпадают!');
        return;
    }

    if (password.length < 6) {
        alert('Пароль должен содержать минимум 6 символов');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Создать профиль пользователя
        await db.collection('users').doc(user.uid).set({
            email: email,
            nickname: email.split('@')[0],
            username: generateUsername(email),
            bio: '',
            avatarUrl: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Регистрация успешна!', 'success');
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showMessage('Ошибка регистрации: ' + error.message, 'error');
    }
}

// Генерация username из email
function generateUsername(email) {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_') + '_' + Math.random().toString(36).substr(2, 5);
}

// Вход
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert('Заполните все поля');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error('Ошибка входа:', error);
        showMessage('Ошибка входа: ' + error.message, 'error');
    }
}

// Выход
async function logout() {
    if (chatsListener) {
        chatsListener();
    }
    if (messagesListener) {
        messagesListener();
    }
    await auth.signOut();
}

// Загрузка профиля пользователя
async function loadUserProfile(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            currentUserData = doc.data();
            updateProfileUI();
        }
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
    }
}

// Обновление UI профиля
function updateProfileUI() {
    if (!currentUserData) return;

    // Обновление аватара
    const avatars = document.querySelectorAll('#user-avatar, #profile-avatar');
    avatars.forEach(avatar => {
        if (currentUserData.avatarUrl) {
            avatar.src = currentUserData.avatarUrl;
            avatar.onerror = function() {
                this.src = 'https://via.placeholder.com/100?text=USER';
            };
        }
    });

    // Обновление никнейма
    document.getElementById('user-nickname').textContent = currentUserData.nickname;
    document.getElementById('profile-nickname').value = currentUserData.nickname;
    document.getElementById('profile-username').value = currentUserData.username;
    document.getElementById('profile-bio').value = currentUserData.bio || '';
}

// Загрузка аватара
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB');
        return;
    }

    try {
        // Загрузка в Firebase Storage
        const storageRef = storage.ref();
        const avatarRef = storageRef.child(`avatars/${currentUser.uid}/${Date.now()}_${file.name}`);
        const snapshot = await avatarRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();

        // Обновление в Firestore
        await db.collection('users').doc(currentUser.uid).update({
            avatarUrl: downloadURL
        });

        // Обновление локальных данных
        currentUserData.avatarUrl = downloadURL;
        updateProfileUI();

        showMessage('Аватар успешно обновлен!', 'success');
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showMessage('Ошибка загрузки аватара: ' + error.message, 'error');
    }
}

// Обновление профиля
async function updateProfile() {
    const nickname = document.getElementById('profile-nickname').value.trim();
    const username = document.getElementById('profile-username').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();

    if (!nickname || !username) {
        alert('Заполните обязательные поля');
        return;
    }

    // Валидация username
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        alert('Username может содержать только английские буквы, цифры и нижние подчеркивания');
        return;
    }

    if (username.length < 3) {
        alert('Username должен содержать минимум 3 символа');
        return;
    }

    try {
        // Проверка уникальности username
        if (username !== currentUserData.username) {
            const usernameQuery = await db.collection('users')
                .where('username', '==', username)
                .get();
            
            if (!usernameQuery.empty) {
                alert('Этот username уже занят');
                return;
            }
        }

        // Обновление профиля
        await db.collection('users').doc(currentUser.uid).update({
            nickname: nickname,
            username: username,
            bio: bio,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Обновление локальных данных
        currentUserData.nickname = nickname;
        currentUserData.username = username;
        currentUserData.bio = bio;
        
        updateProfileUI();
        showMessage('Профиль успешно обновлен!', 'success');
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        showMessage('Ошибка обновления профиля: ' + error.message, 'error');
    }
}

// Поиск пользователей
async function searchUsers() {
    const query = document.getElementById('search-input').value.trim();
    const resultsContainer = document.getElementById('search-results');

    if (!query) {
        resultsContainer.innerHTML = '<p class="text-center">Введите username для поиска</p>';
        return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(query)) {
        resultsContainer.innerHTML = '<p class="text-center">Используйте только английские буквы, цифры и _</p>';
        return;
    }

    try {
        resultsContainer.innerHTML = '<p class="text-center">Поиск...</p>';

        const usersQuery = await db.collection('users')
            .where('username', '>=', query)
            .where('username', '<=', query + '\uf8ff')
            .limit(10)
            .get();

        if (usersQuery.empty) {
            resultsContainer.innerHTML = '<p class="text-center">Пользователи не найдены</p>';
            return;
        }

        resultsContainer.innerHTML = '';
        let foundUsers = false;
        
        usersQuery.forEach(doc => {
            const user = doc.data();
            if (doc.id !== currentUser.uid) {
                const userElement = createUserElement(user, doc.id);
                resultsContainer.appendChild(userElement);
                foundUsers = true;
            }
        });

        if (!foundUsers) {
            resultsContainer.innerHTML = '<p class="text-center">Пользователи не найдены</p>';
        }
    } catch (error) {
        console.error('Ошибка поиска:', error);
        resultsContainer.innerHTML = '<p class="text-center">Ошибка поиска</p>';
    }
}

// Создание элемента пользователя
function createUserElement(user, userId) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = `
        <img src="${user.avatarUrl || 'https://via.placeholder.com/50?text=USER'}" 
             alt="Аватар" class="avatar" onerror="this.src='https://via.placeholder.com/50?text=USER'">
        <div class="user-info">
            <strong>${user.nickname}</strong>
            <p>@${user.username}</p>
            ${user.bio ? `<p class="user-bio">${user.bio}</p>` : ''}
        </div>
        <button onclick="startChatWithUser('${userId}')" class="btn-primary" style="margin-left: auto;">
            Написать
        </button>
    `;
    return div;
}

// Начать чат с пользователем
async function startChatWithUser(userId) {
    try {
        // Проверяем, существует ли уже чат
        const existingChat = await findExistingChat(userId);
        
        if (existingChat) {
            openChat(existingChat.id, userId);
        } else {
            // Создаем новый чат
            const chatRef = await db.collection('chats').add({
                participants: [currentUser.uid, userId],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: 'Чат создан',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            openChat(chatRef.id, userId);
        }
        
        showSection('chat');
    } catch (error) {
        console.error('Ошибка создания чата:', error);
        showMessage('Ошибка создания чата: ' + error.message, 'error');
    }
}

// Поиск существующего чата
async function findExistingChat(userId) {
    const chatQuery = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();

    for (let doc of chatQuery.docs) {
        const chat = doc.data();
        if (chat.participants.includes(userId)) {
            return { id: doc.id, ...chat };
        }
    }
    return null;
}

// Загрузка чатов
function loadChats() {
    if (chatsListener) {
        chatsListener();
    }

    chatsListener = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastMessageTime', 'desc')
        .onSnapshot(async (snapshot) => {
            const chatsContainer = document.getElementById('chats-list');
            chatsContainer.innerHTML = '';

            if (snapshot.empty) {
                chatsContainer.innerHTML = '<p class="text-center">У вас пока нет чатов</p>';
                return;
            }

            const chats = [];
            for (let doc of snapshot.docs) {
                const chat = doc.data();
                const otherUserId = chat.participants.find(id => id !== currentUser.uid);
                
                if (otherUserId) {
                    const user = await getUserData(otherUserId);
                    chats.push({ chat, id: doc.id, user });
                }
            }

            // Сортируем по времени последнего сообщения
            chats.sort((a, b) => {
                const timeA = a.chat.lastMessageTime ? a.chat.lastMessageTime.toDate() : new Date(0);
                const timeB = b.chat.lastMessageTime ? b.chat.lastMessageTime.toDate() : new Date(0);
                return timeB - timeA;
            });

            chats.forEach(({ chat, id, user }) => {
                const chatElement = createChatElement(chat, id, user);
                chatsContainer.appendChild(chatElement);
            });
        }, error => {
            console.error('Ошибка загрузки чатов:', error);
        });
}

// Получение данных пользователя
async function getUserData(userId) {
    if (usersCache.has(userId)) {
        return usersCache.get(userId);
    }

    try {
        const doc = await db.collection('users').doc(userId).get();
        if (doc.exists) {
            const userData = doc.data();
            usersCache.set(userId, userData);
            return userData;
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
    }
    
    return { nickname: 'Неизвестный', username: 'unknown', avatarUrl: '' };
}

// Создание элемента чата
function createChatElement(chat, chatId, user) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.onclick = () => openChat(chatId, chat.participants.find(id => id !== currentUser.uid));
    
    const lastMessageTime = chat.lastMessageTime ? 
        formatTime(chat.lastMessageTime.toDate()) : '';
    
    div.innerHTML = `
        <img src="${user.avatarUrl || 'https://via.placeholder.com/50?text=USER'}" 
             alt="Аватар" class="avatar" onerror="this.src='https://via.placeholder.com/50?text=USER'">
        <div class="chat-info">
            <strong>${user.nickname}</strong>
            <p>@${user.username}</p>
            ${chat.lastMessage ? `<small>${chat.lastMessage}</small>` : '<small>Нет сообщений</small>'}
        </div>
        ${lastMessageTime ? `<span class="message-time">${lastMessageTime}</span>` : ''}
    `;
    
    return div;
}

// Открытие чата
async function openChat(chatId, otherUserId) {
    currentChat = { id: chatId, otherUserId: otherUserId };
    
    const user = await getUserData(otherUserId);
    document.getElementById('chat-username').textContent = user.nickname;
    const chatAvatar = document.getElementById('chat-avatar');
    chatAvatar.src = user.avatarUrl || 'https://via.placeholder.com/40?text=USER';
    chatAvatar.onerror = function() {
        this.src = 'https://via.placeholder.com/40?text=USER';
    };
    
    // Активируем поле ввода
    document.getElementById('message-input').disabled = false;
    document.querySelector('.message-input-container button').disabled = false;
    
    loadMessages(chatId);
    showSection('chat');
}

// Загрузка сообщений
function loadMessages(chatId) {
    if (messagesListener) {
        messagesListener();
    }

    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '<p class="text-center">Загрузка сообщений...</p>';

    messagesListener = db.collection('chats').doc(chatId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            messagesContainer.innerHTML = '';
            
            if (snapshot.empty) {
                messagesContainer.innerHTML = '<p class="text-center">Нет сообщений. Начните общение!</p>';
                return;
            }

            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = createMessageElement(message);
                messagesContainer.appendChild(messageElement);
            });

            // Прокрутка к последнему сообщению
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }, error => {
            console.error('Ошибка загрузки сообщений:', error);
            messagesContainer.innerHTML = '<p class="text-center">Ошибка загрузки сообщений</p>';
        });
}

// Создание элемента сообщения
function createMessageElement(message) {
    const div = document.createElement('div');
    const isSent = message.senderId === currentUser.uid;
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = message.timestamp ? formatTime(message.timestamp.toDate()) : 'только что';
    
    div.innerHTML = `
        <div class="message-text">${message.text}</div>
        <div class="message-time">${time}</div>
    `;
    
    return div;
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !currentChat) return;

    try {
        // Добавляем сообщение в подколлекцию
        await db.collection('chats').doc(currentChat.id).collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Обновляем последнее сообщение в чате
        await db.collection('chats').doc(currentChat.id).update({
            lastMessage: text.length > 50 ? text.substring(0, 50) + '...' : text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });

        input.value = '';
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showMessage('Ошибка отправки сообщения: ' + error.message, 'error');
    }
}

// Форматирование времени
function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    return date.toLocaleDateString('ru-RU');
}

// Показать секцию
function showSection(sectionName) {
    // Скрыть все секции
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Показать выбранную секцию
    document.getElementById(sectionName + '-section').classList.add('active');
    
    // Обновить активную кнопку навигации
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Активируем кнопку в сайдбаре, если это не чат
    if (sectionName !== 'chat') {
        const navBtn = document.querySelector(`.nav-btn[onclick="showSection('${sectionName}')"]`);
        if (navBtn) navBtn.classList.add('active');
    }
}

// Новый чат
function startNewChat() {
    document.getElementById('new-chat-modal').classList.add('active');
}

function closeNewChatModal() {
    document.getElementById('new-chat-modal').classList.remove('active');
    document.getElementById('new-chat-username').value = '';
}

async function createNewChat() {
    const username = document.getElementById('new-chat-username').value.trim();
    
    if (!username) {
        alert('Введите username');
        return;
    }

    try {
        // Находим пользователя по username
        const userQuery = await db.collection('users')
            .where('username', '==', username)
            .get();

        if (userQuery.empty) {
            alert('Пользователь не найден');
            return;
        }

        const userDoc = userQuery.docs[0];
        if (userDoc.id === currentUser.uid) {
            alert('Нельзя начать чат с самим собой');
            return;
        }

        closeNewChatModal();
        await startChatWithUser(userDoc.id);
        
    } catch (error) {
        console.error('Ошибка создания чата:', error);
        showMessage('Ошибка: ' + error.message, 'error');
    }
}

// Вспомогательные функции
function showMessage(text, type) {
    alert(text); // Можно заменить на красивые уведомления
}

function setLoading(element, isLoading) {
    if (isLoading) {
        element.classList.add('loading');
        element.disabled = true;
    } else {
        element.classList.remove('loading');
        element.disabled = false;
    }
}

// Обработка ошибок изображений
document.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG') {
        e.target.src = 'https://via.placeholder.com/100?text=ERROR';
    }
}, true);
