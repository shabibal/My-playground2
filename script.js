// --- Location & Map Variables ---
let map;
let userMarker;
let venueMarkers = [];
let userLocation = null;
let currentMapStyle = 'street';
let venueMap;

// --- Databases & Data Persistence ---
function loadData() {
    return {
        pendingOwnerAccounts: JSON.parse(localStorage.getItem('pendingOwnerAccounts')) || [],
        approvedOwners: JSON.parse(localStorage.getItem('approvedOwners')) || [],
        publishedVenues: JSON.parse(localStorage.getItem('publishedVenues')) || [],
        allBookings: JSON.parse(localStorage.getItem('allBookings')) || [],
        tournaments: JSON.parse(localStorage.getItem('tournaments')) || [],
        reviews: JSON.parse(localStorage.getItem('reviews')) || [],
        discountCodes: JSON.parse(localStorage.getItem('discountCodes')) || [],
        notifications: JSON.parse(localStorage.getItem('notifications')) || [],
        chatMessages: JSON.parse(localStorage.getItem('chatMessages')) || []
    };
}

function saveData(data) {
    localStorage.setItem('pendingOwnerAccounts', JSON.stringify(data.pendingOwnerAccounts));
    localStorage.setItem('approvedOwners', JSON.stringify(data.approvedOwners));
    localStorage.setItem('publishedVenues', JSON.stringify(data.publishedVenues));
    localStorage.setItem('allBookings', JSON.stringify(data.allBookings));
    localStorage.setItem('tournaments', JSON.stringify(data.tournaments));
    localStorage.setItem('reviews', JSON.stringify(data.reviews));
    localStorage.setItem('discountCodes', JSON.stringify(data.discountCodes));
    localStorage.setItem('notifications', JSON.stringify(data.notifications));
    localStorage.setItem('chatMessages', JSON.stringify(data.chatMessages));
}

let db = loadData();

// --- State Management ---
let currentLoggedInUser = null;
let currentVenueId = null;
let pendingBooking = null;
let currentPendingBookingId = null;
let currentSport = 'football';

// --- Location Functions ---
function initializeMap() {
    if (!map) {
        map = L.map('mapContainer').setView([24.7136, 46.6753], 11); // Default: Riyadh
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add click event to map
        map.on('click', function(e) {
            console.log('Clicked at: ' + e.latlng);
        });
    }
    
    // Add venue markers
    updateVenueMarkers();
}

function updateVenueMarkers() {
    // Clear existing markers
    venueMarkers.forEach(marker => map.removeLayer(marker));
    venueMarkers = [];

    // Add markers for venues
    db.publishedVenues.forEach(venue => {
        if (venue.sport === currentSport && venue.lat && venue.lng) {
            const marker = L.marker([venue.lat, venue.lng])
                .addTo(map)
                .bindPopup(`
                    <div style="text-align: right; direction: rtl;">
                        <h4>${venue.name}</h4>
                        <p><i class="fas fa-map-marker-alt"></i> ${venue.location}</p>
                        <p><i class="fas fa-phone"></i> ${venue.contact}</p>
                        <button class="btn btn-primary btn-sm" onclick="showVenueDetails(${venue.id})">
                            <i class="fas fa-info-circle"></i> التفاصيل
                        </button>
                    </div>
                `);
            venueMarkers.push(marker);
        }
    });
}

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Add user marker
                if (userMarker) {
                    map.removeLayer(userMarker);
                }
                
                userMarker = L.marker([userLocation.lat, userLocation.lng], {
                    icon: L.divIcon({
                        html: '<i class="fas fa-user-circle" style="color: #3498db; font-size: 24px;"></i>',
                        iconSize: [24, 24],
                        className: 'user-location-marker'
                    })
                }).addTo(map).bindPopup('موقعك الحالي');
                
                // Center map on user location
                map.setView([userLocation.lat, userLocation.lng], 12);
                
                // Update nearby venues
                updateNearbyVenues();
                calculateDistances();
                
                showNotification('تم تحديد موقعك بنجاح!', 'success');
            },
            error => {
                console.error('Error getting location:', error);
                showNotification('لم نتمكن من تحديد موقعك. يرجى التحقق من إعدادات الموقع.', 'error');
            }
        );
    } else {
        showNotification('المتصفح لا يدعم تحديد الموقع', 'error');
    }
}

function updateNearbyVenues() {
    if (!userLocation) return;
    
    const nearbyList = document.getElementById('nearbyList');
    nearbyList.innerHTML = '';
    
    const maxDistance = parseFloat(document.getElementById('distanceSlider').value);
    const nearbyVenues = db.publishedVenues
        .filter(venue => venue.sport === currentSport)
        .map(venue => {
            const distance = calculateDistance(userLocation, venue);
            return { ...venue, distance };
        })
        .filter(venue => venue.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5); // Show top 5 nearby venues
    
    if (nearbyVenues.length === 0) {
        nearbyList.innerHTML = '<p class="text-center">لا توجد منشآت قريبة ضمن المسافة المحددة</p>';
        return;
    }
    
    nearbyVenues.forEach(venue => {
        const item = document.createElement('div');
        item.className = 'nearby-item';
        item.onclick = () => showVenueDetails(venue.id);
        item.innerHTML = `
            <div class="nearby-venue-info">
                <div class="nearby-venue-name">${venue.name}</div>
                <div class="nearby-venue-distance">
                    <i class="fas fa-route"></i> ${venue.distance.toFixed(1)} كم
                </div>
                <div class="nearby-venue-rating">
                    ${generateStars(getAverageRating(venue.id))}
                </div>
            </div>
            <button class="btn btn-primary btn-sm">
                <i class="fas fa-arrow-left"></i> عرض
            </button>
        `;
        nearbyList.appendChild(item);
    });
}

function calculateDistance(point1, point2) {
    if (!point1.lat || !point1.lng || !point2.lat || !point2.lng) return Infinity;
    
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateDistances() {
    if (!userLocation) return;
    
    // Update distance display for all venues
    db.publishedVenues.forEach(venue => {
        if (venue.sport === currentSport) {
            venue.distance = calculateDistance(userLocation, venue);
        }
    });
}

function updateDistanceFilter(value) {
    document.getElementById('distanceValue').textContent = value + ' كم';
    if (userLocation) {
        updateNearbyVenues();
    }
}

function filterByDistance() {
    if (!userLocation) {
        showNotification('يرجى تحديد موقعك أولاً', 'error');
        return;
    }
    
    const maxDistance = parseFloat(document.getElementById('distanceSlider').value);
    const filtered = db.publishedVenues.filter(venue => {
        return venue.sport === currentSport && 
               venue.distance && 
               venue.distance <= maxDistance;
    });
    
    renderVenues(filtered);
    showNotification(`تم عرض ${filtered.length} منشأة ضمن مسافة ${maxDistance} كم`, 'success');
}

function clearLocationFilter() {
    document.getElementById('distanceSlider').value = 10;
    document.getElementById('distanceValue').textContent = '10 كم';
    displayVenuesForPlayer();
}

function centerMapOnUser() {
    if (userLocation) {
        map.setView([userLocation.lat, userLocation.lng], 14);
    } else {
        getUserLocation();
    }
}

function toggleMapStyle() {
    // Simple toggle between different tile layers
    const tiles = [
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
    ];
    
    currentMapStyle = (currentMapStyle + 1) % tiles.length;
    
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });
    
    L.tileLayer(tiles[currentMapStyle], {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function toggleFullscreen() {
    const mapContainer = document.getElementById('mapContainer');
    if (!document.fullscreenElement) {
        mapContainer.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function getDirections() {
    const venue = db.publishedVenues.find(v => v.id === currentVenueId);
    if (!venue || !userLocation) return;
    
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${venue.lat},${venue.lng}`;
    window.open(url, '_blank');
}

function initializeVenueMap() {
    const venue = db.publishedVenues.find(v => v.id === currentVenueId);
    if (!venue || !venue.lat || !venue.lng) return;
    
    // Initialize venue detail map
    venueMap = L.map('venueMap').setView([venue.lat, venue.lng], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(venueMap);
    
    // Add venue marker
    L.marker([venue.lat, venue.lng])
        .addTo(venueMap)
        .bindPopup(`<b>${venue.name}</b><br>${venue.location}`)
        .openPopup();
    
    // Update distance if user location is available
    if (userLocation) {
        const distance = calculateDistance(userLocation, venue);
        document.getElementById('venueDistance').innerHTML = `
            <i class="fas fa-route"></i>
            <span>${distance.toFixed(1)} كم من موقعك</span>
        `;
    }
    
    document.getElementById('venueLocationText').textContent = venue.location;
}

// --- Page Navigation ---
function showPage(pageId) {
    const pages = document.querySelectorAll('body > div');
    pages.forEach(page => page.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');

    const header = document.getElementById('appHeader');
    if (['playerInterface', 'venueDetailPage', 'paymentPage', 'tournamentsPage', 'chatPage', 'adminChatPage', 'sportsSelectionPage'].includes(pageId)) {
        header.classList.remove('hidden');
        document.getElementById('headerUserName').textContent = 'ضيف';
    } else {
        header.classList.add('hidden');
    }

    if (pageId === 'playerInterface') {
        displayVenuesForPlayer();
        setTimeout(() => initializeMap(), 100);
    }
    if (pageId === 'venueDetailPage') {
        setTimeout(() => initializeVenueMap(), 100);
    }
    if (pageId === 'paymentPage') {
        renderPayPalButton(); // استدعاء دالة عرض زر الدفع عند فتح صفحة الدفع
    }
    if (pageId === 'ownerDashboard') { showOwnerSection('overview'); }
    if (pageId === 'adminDashboard') { showAdminSection('overview'); }
    if (pageId === 'tournamentsPage') displayAllTournaments();
    if (pageId === 'createTournamentPage') populateVenueSelect();
    if (pageId === 'chatPage') loadChatMessages(currentPendingBookingId, 'user');
    if (pageId === 'adminChatPage') loadChatMessages(currentPendingBookingId, 'admin');
}

// --- Sport Selection ---
function selectSport(sport) {
    currentSport = sport;
    showPage('playerInterface');
    updatePlayerInterfaceHeader();
    updateFiltersForSport();
    displayVenuesForPlayer();
    updateVenueMarkers();
}

function updatePlayerInterfaceHeader() {
    const titles = {
        football: '<i class="fas fa-futbol"></i> اكتشف ملاعب كرة القدم',
        volleyball: '<i class="fas fa-volleyball-ball"></i> اكتشف ملاعب كرة الطائرة',
        basketball: '<i class="fas fa-basketball-ball"></i> اكتشف ملاعب كرة السلة',
        tennis: '<i class="fas fa-table-tennis"></i> اكتشف ملاعب تنس الطاولة',
        swimming: '<i class="fas fa-swimmer"></i> اكتشف المسابح',
        esports: '<i class="fas fa-gamepad"></i> اكتشف مراكز الرياضات الإلكترونية'
    };
    document.getElementById('playerInterfaceTitle').innerHTML = titles[currentSport] || titles['football'];
}

function updateFiltersForSport() {
    const surfaceFilter = document.getElementById('filterSurface');
    const sizeFilter = document.getElementById('filterSize');

    surfaceFilter.innerHTML = '<option value="">الكل</option>';
    sizeFilter.innerHTML = '<option value="">الكل</option>';

    const sportFilters = {
        football: { surface: ['عشبي طبيعي', 'عشبي صناعي'], size: ['5vs5', '7vs7', '11vs11'] },
        volleyball: { surface: ['رمل', 'باركيه'], size: ['مقاس واحد'] },
        basketball: { surface: ['باركيه', 'اسمنتي'], size: ['مقاس واحد'] },
        tennis: { surface: ['أسفلت', 'صلصال', 'عشب'], size: ['مقاس واحد', 'مقاس مزدوج'] },
        swimming: { surface: ['ماء'], size: ['مسبح صغير', 'مسبح كبير', 'مسبح أولمبي'] },
        esports: { surface: ['كمبيوتر', 'PlayStation', 'Xbox'], size: ['غرفة فردية', 'غرفة مزدوجة'] }
    };

    const filters = sportFilters[currentSport] || sportFilters['football'];
    filters.surface.forEach(s => surfaceFilter.innerHTML += `<option value="${s}">${s}</option>`);
    filters.size.forEach(s => sizeFilter.innerHTML += `<option value="${s}">${s}</option>`);
}

// --- Player Interface (Guest) ---
function displayVenuesForPlayer() {
    const venues = db.publishedVenues.filter(v => v.sport === currentSport);
    renderVenues(venues);
}

function applyFilters() {
    const city = document.getElementById('citySearchInput').value.toLowerCase();
    const surface = document.getElementById('filterSurface').value;
    const size = document.getElementById('filterSize').value;
    const lights = document.getElementById('filterLights').value;

    const filtered = db.publishedVenues.filter(v => {
        return v.sport === currentSport &&
            (city ? v.city.toLowerCase().includes(city) : true) &&
            (surface ? v.surface === surface : true) &&
            (size ? v.size === size : true) &&
            (lights ? v.lights.toString() === lights : true);
    });
    renderVenues(filtered);
}

function renderVenues(venuesToRender) {
    const container = document.getElementById('venuesListForPlayer');
    container.innerHTML = '';
    if (venuesToRender.length === 0) { 
        container.innerHTML = '<p class="text-center">لا توجد منشآت مطابقة لبحثك.</p>'; 
        return; 
    }
    
    venuesToRender.forEach(venue => {
        const card = document.createElement('li'); 
        card.className = 'venue-card'; 
        card.onclick = () => showVenueDetails(venue.id);
        
        const avgRating = getAverageRating(venue.id);
        const icon = getSportIcon(venue.sport);
        const distance = venue.distance ? `<div class="distance-info"><i class="fas fa-route"></i> ${venue.distance.toFixed(1)} كم</div>` : '';
        
        card.innerHTML = `
            <div class="venue-image-placeholder"><i class="${icon}"></i></div>
            <div class="venue-card-body">
                <h3>${venue.name}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${venue.city}</p>
                <p><i class="fas fa-user"></i> ${venue.ownerName}</p>
                <p><i class="fas fa-phone"></i> ${venue.contact}</p>
                ${distance}
                <div class="rating">${generateStars(avgRating)}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

function getSportIcon(sport) {
    const icons = {
        football: 'fas fa-futbol',
        volleyball: 'fas fa-volleyball-ball',
        basketball: 'fas fa-basketball-ball',
        tennis: 'fas fa-table-tennis',
        swimming: 'fas fa-swimmer',
        esports: 'fas fa-gamepad'
    };
    return icons[sport] || 'fas fa-futbol';
}

// --- Venue Detail & Booking (Guest) ---
function showVenueDetails(venueId) {
    currentVenueId = venueId;
    const venue = db.publishedVenues.find(v => v.id === venueId); 
    if (!venue) return;
    
    document.getElementById('detailVenueName').textContent = venue.name;
    
    let infoHtml = `
        <p><strong>المدينة:</strong> ${venue.city}</p>
        <p><strong>الموقع:</strong> ${venue.location}</p>
        <p><strong>التواصل:</strong> ${venue.contact}</p>
        <p><strong>التفاصيل:</strong> ${venue.details || 'لا توجد تفاصيل إضافية'}</p>
        <p><strong>السطح:</strong> ${venue.surface}</p>
        <p><strong>الحجم:</strong> ${venue.size}</p>
        <p><strong>الإضاءة:</strong> ${venue.lights ? 'متوفرة' : 'غير متوفرة'}</p>
    `;
    
    if (venue.sport === 'esports') {
        infoHtml += `
            <p><strong>عدد الأجهزة:</strong> ${venue.equipmentCount || 'N/A'}</p>
            <p><strong>الألعاب المتوفرة:</strong> ${venue.availableGames ? venue.availableGames.join(', ') : 'N/A'}</p>
        `;
    }
    
    document.getElementById('detailVenueInfo').innerHTML = infoHtml;
    document.getElementById('reviewsContainer').innerHTML = renderReviews(venueId);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').setAttribute('min', today);
    document.getElementById('bookingDate').value = today;
    
    generateTimeSlots();
    showPage('venueDetailPage');
}

function generateTimeSlots() {
    const venue = db.publishedVenues.find(v => v.id === currentVenueId);
    const selectedDate = document.getElementById('bookingDate').value;
    const container = document.getElementById('timeSlotsContainer'); 
    container.innerHTML = '';
    
    for (let hour = venue.openingHour; hour < venue.closingHour; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        const isBooked = db.allBookings.some(b => 
            b.venueId === currentVenueId && 
            b.date === selectedDate && 
            b.time === timeString && 
            b.paymentStatus === 'confirmed'
        );
        const isPeak = hour >= 18 && hour <= 21;
        const price = isPeak ? venue.pricePeak : venue.priceOffPeak;
        
        const slotDiv = document.createElement('div');
        slotDiv.className = `time-slot ${isBooked ? 'booked' : 'available'}`;
        slotDiv.innerHTML = `
            ${timeString}<br>
            <span class="price-tag">${price} ريال</span>
        `;
        
        if (isBooked) { 
            slotDiv.innerHTML += `<br><small>محجوز</small>`; 
        } else { 
            slotDiv.onclick = () => initiateBooking(selectedDate, timeString, price); 
        }
        
        container.appendChild(slotDiv);
    }
}

function initiateBooking(date, time, price) {
    const playerName = prompt("ادخل رقم الهاتف و أدخل اسمك الكامل لتأكيد الحجز:"); 
    if (!playerName) return;
    
    pendingBooking = { date, time, basePrice: price };
    const discountCode = document.getElementById('discountCodeInput').value;
    const discount = db.discountCodes.find(d => d.code === discountCode);
    const finalPrice = discount ? price * (1 - discount.percent / 100) : price;
    
    pendingBooking.finalPrice = finalPrice;
    pendingBooking.discountCode = discount ? discount.code : null;
    pendingBooking.playerName = playerName;

    // حساب المبلغ بالدولار الأمريكي
    const conversionRate = 3.75;
    const finalPriceUSD = (finalPrice / conversionRate).toFixed(2);

    const venue = db.publishedVenues.find(v => v.id === currentVenueId);
    document.getElementById('paymentSummary').innerHTML = `
        <p><strong>المنشأة:</strong> ${venue.name}</p>
        <p><strong>اللاعب:</strong> ${playerName}</p>
        <p><strong>التاريخ:</strong> ${date}</p>
        <p><strong>الوقت:</strong> ${time}</p>
        <p><strong>السعر الأساسي:</strong> ${price} ريال</p>
        ${discount ? `<p><strong>الخصم (${discount.code}):</strong> ${discount.percent}%</p>` : ''}
        <h3>المبلغ الإجمالي: <span class="price-tag">${finalPrice} ريال</span> (${finalPriceUSD} دولار)</h3>
    `;
    showPage('paymentPage');
}

// --- Render PayPal Button ---
// --- Render PayPal Button ---
function renderPayPalButton() {
    // تأكد من وجود حجز معلق
    if (!pendingBooking) {
        showNotification('لا يوجد حجز نشط للدفع.', 'error');
        showPage('playerInterface');
        return;
    }

    // مسح أي أزرار سابقة
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';

    // تحويل المبلغ من الريال السعودي إلى الدولار الأمريكي (باستخدام سعر تقريبي 1 USD = 3.75 SAR)
    const conversionRate = 3.75;
    const amountInUSD = (pendingBooking.finalPrice / conversionRate).toFixed(2);

    paypal.Buttons({
        // إعداد المعاملة عند الضغط على زر الدفع
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: amountInUSD // المبلغ بالدولار الأمريكي
                    }
                }]
            });
        },

        // تنفيذ الإجراء بعد موافقة الدافع
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(orderData) {
                // تمت عملية الدفع بنجاح!
                const transaction = orderData.purchase_units[0].payments.captures[0];
                console.log('Payment successful:', transaction);

                // إنشاء الحجز في قاعدة البيانات
                const newBooking = { 
                    id: Date.now(), 
                    venueId: currentVenueId, 
                    venue: db.publishedVenues.find(v => v.id === currentVenueId), 
                    playerName: pendingBooking.playerName, 
                    date: pendingBooking.date, 
                    time: pendingBooking.time, 
                    finalPrice: pendingBooking.finalPrice, // الاحتفاظ بالمبلغ الأصلي بالريال السعودي
                    finalPriceUSD: amountInUSD, // إضافة المبلغ بالدولار الأمريكي
                    paymentMethod: 'paypal', 
                    paymentStatus: 'confirmed', // تم تأكيد الدفع مباشرة
                    paypalTransactionId: transaction.id // حفظ رقم المعاملة كمرجع
                };
                db.allBookings.push(newBooking); 
                saveData(db);
                
                addNotification(`تم تأكيد حجز جديد: ${newBooking.venue.name} بواسطة ${newBooking.playerName}`);
                
                // إظهار رسالة نجاح
                document.getElementById('paymentMessage').textContent = 'تم الدفع بنجاح! تم تأكيد حجزك.';
                document.getElementById('paymentMessage').className = 'message success'; 
                document.getElementById('paymentMessage').classList.remove('hidden');
                
                // إعادة تعيين الحجز المعلق والعودة للصفحة الرئيسية
                pendingBooking = null;
                setTimeout(() => { showPage('playerInterface'); }, 2500);
            });
        },

        // معالجة الأخطاء
        onError: function (err) {
            console.error('PayPal error:', err);
            showNotification('حدث خطأ أثناء معالجة الدفع عبر PayPal. يرجى المحاولة مرة أخرى.', 'error');
        },

        // معالجة إلغاء الدفع
        onCancel: function (data) {
            console.log('Payment cancelled by user');
            showNotification('تم إلغاء عملية الدفع.', 'error');
        }
    }).render('#paypal-button-container'); // عرض الزر في الحاوية المحددة
}

// --- Chat Functions ---
function loadChatMessages(bookingId, userType) {
    const messagesContainer = userType === 'admin' ? document.getElementById('adminChatMessages') : document.getElementById('chatMessages');
    messagesContainer.innerHTML = '';
    const messages = db.chatMessages.filter(m => m.bookingId === bookingId);
    if (messages.length === 0) { 
        const welcomeMsg = { 
            sender: 'admin', 
            text: 'مرحباً! يرجى إرسال صورة تأكيد الدفع لتأكيد حجزك.', 
            timestamp: Date.now() 
        }; 
        db.chatMessages.push({ ...welcomeMsg, bookingId }); 
        saveData(db); 
        messages.push(welcomeMsg); 
    }
    messages.forEach(msg => displayMessage(msg, messagesContainer));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayMessage(msg, container) {
    const messageDiv = document.createElement('div'); 
    messageDiv.className = `message-bubble ${msg.sender}`;
    let content = `<p>${msg.text}</p>`; 
    if (msg.imageUrl) { 
        content += `<img src="${msg.imageUrl}" alt="صورة تأكيد الدفع">`; 
    }
    messageDiv.innerHTML = content; 
    container.appendChild(messageDiv);
}

function sendMessage() {
    const input = document.getElementById('chatInput'); 
    const text = input.value.trim();
    if (!text || !currentPendingBookingId) return;
    
    const message = { 
        bookingId: currentPendingBookingId, 
        sender: 'user', 
        text: text, 
        timestamp: Date.now() 
    };
    db.chatMessages.push(message); 
    saveData(db);
    displayMessage(message, document.getElementById('chatMessages'));
    input.value = ''; 
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
}

function sendImage(event) {
    const file = event.target.files[0]; 
    if (!file || !currentPendingBookingId) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const message = { 
            bookingId: currentPendingBookingId, 
            sender: 'user', 
            text: 'تم إرسال صورة تأكيد الدفع.', 
            imageUrl: e.target.result, 
            timestamp: Date.now() 
        };
        db.chatMessages.push(message); 
        saveData(db);
        displayMessage(message, document.getElementById('chatMessages'));
        document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        addNotification(`تم إرسال صورة تأكيد الدفع لحجز #${currentPendingBookingId}`);
    };
    reader.readAsDataURL(file); 
    event.target.value = '';
}

function showAdminChat(bookingId) { 
    currentPendingBookingId = bookingId; 
    showPage('adminChatPage'); 
}

function confirmBookingFromChat() {
    if (!currentPendingBookingId) return;
    const bookingIndex = db.allBookings.findIndex(b => b.id === currentPendingBookingId);
    if (bookingIndex > -1) { 
        db.allBookings[bookingIndex].paymentStatus = 'confirmed'; 
        saveData(db);
        const confirmationMsg = { 
            bookingId: currentPendingBookingId, 
            sender: 'admin', 
            text: 'تم تأكيد حجزك بنجاح! شكراً لك.', 
            timestamp: Date.now() 
        };
        db.chatMessages.push(confirmationMsg); 
        saveData(db);
        displayMessage(confirmationMsg, document.getElementById('adminChatMessages'));
        addNotification(`تم تأكيد الحجز #${currentPendingBookingId} بنجاح.`); 
        alert('تم تأكيد الحجز بنجاح!'); 
        showAdminSection('bookings');
    }
}

// --- Notification System ---
function addNotification(text) { 
    db.notifications.unshift({ id: Date.now(), text, read: false }); 
    saveData(db); 
    renderNotifications(); 
}

function showNotification(text, type) {
    const notification = document.createElement('div');
    notification.className = `message ${type}`;
    notification.textContent = text;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.zIndex = '9999';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function renderNotifications() {
    const dropdown = document.getElementById('notificationDropdown'); 
    const badge = document.getElementById('notificationBadge');
    dropdown.innerHTML = ''; 
    const unreadCount = db.notifications.filter(n => !n.read).length; 
    badge.textContent = unreadCount > 0 ? unreadCount : '';
    
    if (db.notifications.length === 0) { 
        dropdown.innerHTML = '<div class="notification-item">لا توجد إشعارات</div>'; 
        return; 
    }
    
    db.notifications.forEach(n => {
        const item = document.createElement('div'); 
        item.className = 'notification-item';
        item.textContent = n.text; 
        item.onclick = () => { 
            n.read = true; 
            saveData(db); 
            renderNotifications(); 
        };
        dropdown.appendChild(item);
    });
}

function toggleNotifications() { 
    document.getElementById('notificationDropdown').classList.toggle('show'); 
}

// --- Authentication ---
document.getElementById('ownerRegistrationForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const newOwner = { 
        id: Date.now(), 
        name: document.getElementById('ownerName').value, 
        email: document.getElementById('ownerEmail').value, 
        password: document.getElementById('ownerPassword').value, 
        phone: document.getElementById('ownerPhone').value, 
        type: 'owner' 
    };
    db.pendingOwnerAccounts.push(newOwner); 
    saveData(db);
    alert('تم إرسال طلبك بنجاح! سيتم مراجعته من قبل الإدارة.'); 
    showPage('ownerLoginPage');
});

document.getElementById('ownerLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('ownerLoginEmail').value; 
    const password = document.getElementById('ownerLoginPassword').value;
    currentLoggedInUser = db.approvedOwners.find(o => o.email === email && o.password === password);
    if (currentLoggedInUser) showPage('ownerDashboard'); 
    else alert('بيانات الدخول غير صحيحة أو حسابك لم يتم تفعيله بعد.');
});

document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (document.getElementById('adminEmail').value === 'admin@mal3abi.com' && document.getElementById('adminPassword').value === 'admin123') {
        currentLoggedInUser = { name: 'Admin', type: 'admin' }; 
        showPage('adminDashboard');
    } else { 
        alert('بيانات الاعتماد غير صحيحة.'); 
    }
});

function logout() { 
    currentLoggedInUser = null; 
    showPage('mainMenuPage'); 
}

// --- Admin Dashboard Logic ---
function showAdminSection(section) {
    const content = document.getElementById('adminContent');
    if (event && event.target && event.target.tagName === 'A') { 
        const links = document.querySelectorAll('.admin-sidebar a'); 
        links.forEach(l => l.classList.remove('active')); 
        event.target.classList.add('active'); 
    }
    
    switch(section) {
        case 'overview': content.innerHTML = `<h2>نظرة عامة</h2>${renderAdminStats()}`; break;
        case 'approvals': content.innerHTML = `<h2>حسابات في انتظار الموافقة</h2>${renderPendingOwners()}`; break;
        case 'users': content.innerHTML = `<h2>إدارة الحسابات</h2>${renderAllUsers()}`; break;
        case 'venues': content.innerHTML = `<h2>إدارة المنشآت</h2>${renderAllVenues()}`; break;
        case 'add-venue': content.innerHTML = `<h2>إضافة منشأة جديدة</h2>${renderAddVenueForm('admin')}`; break;
        case 'bookings': content.innerHTML = `<h2>إدارة الحجوزات</h2>${renderAllBookings()}`; break;
        case 'tournaments': content.innerHTML = `<h2>إدارة البطولات</h2>${renderAllTournaments()}`; break;
        case 'discounts': content.innerHTML = `<h2>إدارة الخصومات</h2>${renderDiscountManagement()}`; break;
    }
}

function renderAdminStats() {
    const totalRevenue = db.allBookings.reduce((sum, b) => sum + b.finalPrice, 0);
    const stats = `<ul class="stats-grid">
        <li class="stat-card"><h3>${db.approvedOwners.length}</h3><p>إجمالي أصحاب المنشآت</p></li>
        <li class="stat-card"><h3>${db.publishedVenues.length}</h3><p>إجمالي المنشآت</p></li>
        <li class="stat-card"><h3>${db.allBookings.length}</h3><p>إجمالي الحجوزات</p></li>
        <li class="stat-card"><h3>${totalRevenue}</h3><p>إجمالي الأرباح (ريال)</p></li>
        <li class="stat-card"><h3>${db.tournaments.length}</h3><p>إجمالي البطولات</p></li>
    </ul>`;
    return stats;
}

function renderPendingOwners() { 
    if (db.pendingOwnerAccounts.length === 0) return '<p class="text-center">لا توجد حسابات في انتظار الموافقة.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th> <th>الهاتف</th><th>إجراء</th></tr></thead><tbody>';
    db.pendingOwnerAccounts.forEach(owner => { 
        html += `<tr>
            <td>${owner.name}</td>
            <td>${owner.email}</td>
            <td>${owner.phone}</td>
            <td class="actions">
                <button class="btn btn-success btn-sm" onclick="approveOwner(${owner.id})">
                    <i class="fas fa-check"></i> موافقة
                </button>
            </td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function renderAllUsers() { 
    let html = '<h3>أصحاب المنشآت</h3>';
    if (db.approvedOwners.length === 0) html += '<p class="text-center">لا يوجد أصحاب منشآت.</p>';
    else { 
        html += '<table class="admin-table"><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الهاتف</th><th>إجراء</th></tr></thead><tbody>';
        db.approvedOwners.forEach(o => { 
            html += `<tr>
                <td>${o.name}</td>
                <td>${o.email}</td>
                <td>${o.phone}</td>
                <td class="actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${o.id}, 'owner')">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </td>
            </tr>`; 
        });
        html += '</tbody></table>'; 
    } 
    return html;
}

function deleteUser(userId, userType) { 
    if (!confirm('هل أنت متأكد من حذف هذا الحساب؟')) return; 
    const userArray = userType === 'owner' ? db.approvedOwners : []; 
    const index = userArray.findIndex(u => u.id === userId); 
    if (index > -1) { 
        userArray.splice(index, 1); 
        saveData(db); 
        addNotification(`تم حذف حساب صاحب المنشأة.`); 
        showAdminSection('users'); 
    } 
}

function renderAllVenues() { 
    if (db.publishedVenues.length === 0) return '<p class="text-center">لا توجد منشآت منشورة.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>الاسم</th><th>الرياضة</th><th>المدينة</th><th>صاحب المنشأة</th><th>التواصل</th><th>إجراء</th></tr></thead><tbody>';
    db.publishedVenues.forEach(v => { 
        const ownerName = v.ownerId ? db.approvedOwners.find(o => o.id === v.ownerId)?.name : 'غير معين';
        html += `<tr>
            <td>${v.name}</td>
            <td>${getSportName(v.sport)}</td>
            <td>${v.city}</td>
            <td>${ownerName}</td>
            <td>${v.contact}</td>
            <td class="actions">
                <button class="btn btn-danger btn-sm" onclick="deleteVenue(${v.id})">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function getSportName(sportKey) { 
    const names = { 
        football: 'كرة القدم', 
        volleyball: 'كرة الطائرة', 
        basketball: 'كرة السلة', 
        tennis: 'تنس الطاولة', 
        swimming: 'السباحة', 
        esports: 'رياضات إلكترونية' 
    }; 
    return names[sportKey] || sportKey; 
}

function deleteVenue(venueId) { 
    if (!confirm('هل أنت متأكد من حذف هذه المنشأة؟')) return; 
    const index = db.publishedVenues.findIndex(v => v.id === venueId); 
    if (index > -1) { 
        db.publishedVenues.splice(index, 1); 
        saveData(db); 
        addNotification(`تم حذف المنشأة.`); 
        showAdminSection('venues'); 
    } 
}

function renderAddVenueForm(role) {
    const formId = role === 'admin' ? 'adminVenueForm' : 'ownerVenueForm';
    return `
    <form id="${formId}" onsubmit="handleAddVenue(event, '${role}')">
        <div class="form-group">
            <label>نوع الرياضة</label>
            <select id="venueSport" onchange="toggleVenueSpecificFields()" required>
                <option value="football">كرة القدم</option>
                <option value="volleyball">كرة الطائرة</option>
                <option value="basketball">كرة السلة</option>
                <option value="tennis">تنس الطاولة</option>
                <option value="swimming">السباحة</option>
                <option value="esports">رياضات إلكترونية</option>
            </select>
        </div>
        <div class="form-group"><label>اسم المنشأة</label><input type="text" id="venueName" required></div>
        <div class="form-group"><label>المدينة</label><input type="text" id="venueCity" required></div>
        <div class="form-group"><label>رقم التواصل</label><input type="tel" id="venueContact" required></div>
        <div class="form-group"><label>الموقع (العنوان)</label><input type="text" id="venueLocation" required></div>
        <div class="form-group">
            <label>إحداثيات العرض (Latitude)</label>
            <input type="number" id="venueLat" step="0.000001" required>
        </div>
        <div class="form-group">
            <label>إحداثيات الطول (Longitude)</label>
            <input type="number" id="venueLng" step="0.000001" required>
        </div>
        <div class="form-group">
            <label>السطح</label>
            <select id="venueSurface">
                <option>عشبي طبيعي</option>
                <option>عشبي صناعي</option>
                <option>باركيه</option>
                <option>اسمنتي</option>
                <option>ماء</option>
            </select>
        </div>
        <div class="form-group">
            <label>الحجم</label>
            <select id="venueSize">
                <option>5vs5</option>
                <option>7vs7</option>
                <option>11vs11</option>
                <option>مقاس واحد</option>
                <option>مقاس مزدوج</option>
                <option>مسبح صغير</option>
                <option>مسبح كبير</option>
                <option>مسبح أولمبي</option>
            </select>
        </div>
        <div class="form-group">
            <label>إضاءة ليلية</label>
            <select id="venueLights">
                <option value="true">متوفرة</option>
                <option value="false">غير متوفرة</option>
            </select>
        </div>
        <div class="form-group"><label>الساعة خارج أوقات الذروة (ريال)</label><input type="number" id="venuePriceOffPeak" required></div>
        <div class="form-group"><label>الساعة في أوقات الذروة (ريال)</label><input type="number" id="venuePricePeak" required></div>
        <div class="form-group"><label>تفاصيل إضافية</label><textarea id="venueDetails"></textarea></div>
        <div id="venueSpecificFields"></div>
        <div class="btn-group">
            <button type="submit" class="btn btn-primary">
                <i class="fas fa-plus-circle"></i> إضافة المنشأة
            </button>
        </div>
    </form>
    `;
}

function toggleVenueSpecificFields() { 
    const sport = document.getElementById('venueSport').value; 
    const container = document.getElementById('venueSpecificFields'); 
    container.innerHTML = ''; 
    
    if (sport === 'esports') { 
        container.innerHTML = `
            <div class="form-group">
                <label>عدد الأجهزة</label>
                <input type="number" id="venueEquipmentCount">
            </div>
            <div class="form-group">
                <label>الألعاب المتوفرة</label>
                <ul class="checkbox-group">
                    <li><label><input type="checkbox" name="games" value="FIFA"> FIFA</label></li>
                    <li><label><input type="checkbox" name="games" value="PES"> PES</label></li>
                    <li><label><input type="checkbox" name="games" value="Fortnite"> Fortnite</label></li>
                    <li><label><input type="checkbox" name="games" value="PUBG"> PUBG</label></li>
                </ul>
            </div>
        `; 
    } 
}

function handleAddVenue(event, role) {
    event.preventDefault();
    const gameCheckboxes = document.querySelectorAll('input[name="games"]:checked');
    const availableGames = Array.from(gameCheckboxes).map(cb => cb.value);
    
    const newVenue = {
        id: Date.now(), 
        ownerId: role === 'owner' ? currentLoggedInUser.id : null, 
        ownerName: role === 'owner' ? currentLoggedInUser.name : 'غير معين',
        sport: document.getElementById('venueSport').value, 
        name: document.getElementById('venueName').value, 
        city: document.getElementById('venueCity').value,
        contact: document.getElementById('venueContact').value, 
        location: document.getElementById('venueLocation').value,
        lat: parseFloat(document.getElementById('venueLat').value),
        lng: parseFloat(document.getElementById('venueLng').value),
        surface: document.getElementById('venueSurface').value,
        size: document.getElementById('venueSize').value, 
        lights: document.getElementById('venueLights').value === 'true', 
        priceOffPeak: parseInt(document.getElementById('venuePriceOffPeak').value),
        pricePeak: parseInt(document.getElementById('venuePricePeak').value), 
        details: document.getElementById('venueDetails').value, 
        openingHour: 16, 
        closingHour: 23, 
        slotDuration: 60
    };
    
    if (newVenue.sport === 'esports') { 
        newVenue.equipmentCount = parseInt(document.getElementById('venueEquipmentCount').value); 
        newVenue.availableGames = availableGames; 
    }
    
    db.publishedVenues.push(newVenue); 
    saveData(db);
    addNotification(`تم إضافة منشأة جديدة: ${newVenue.name}`); 
    alert('تمت إضافة المنشأة بنجاح!');
    
    if (role === 'admin') showAdminSection('venues'); 
    else showOwnerSection('venues');
}

function renderAllBookings() { 
    if (db.allBookings.length === 0) return '<p class="text-center">لا توجد حجوزات.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>المنشأة</th><th>اللاعب</th><th>التاريخ</th><th>الوقت</th><th>السعر</th><th>حالة الدفع</th><th>الإجراءات</th></tr></thead><tbody>';
    db.allBookings.forEach(b => {
        let statusText = 'مؤكد'; 
        let statusClass = 'message success';
        if (b.paymentStatus === 'pending_payment_confirmation') { 
            statusText = 'في انتظار التأكيد'; 
            statusClass = 'message error'; 
        }
        html += `<tr>
            <td>${b.venue.name}</td>
            <td>${b.playerName}</td>
            <td>${b.date}</td>
            <td>${b.time}</td>
            <td>${b.finalPrice} ريال</td>
            <td><span class="${statusClass}" style="padding: 5px 10px; border-radius: 5px; display:inline-block;">${statusText}</span></td>
            <td class="actions">
                ${b.paymentStatus === 'pending_payment_confirmation' ? `<button class="btn btn-primary btn-sm" onclick="showAdminChat(${b.id})"><i class="fas fa-comments"></i> عرض الدردشة</button>` : ''} 
                <button class="btn btn-danger btn-sm" onclick="deleteBooking(${b.id})"><i class="fas fa-trash"></i> حذف</button>
            </td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function deleteBooking(bookingId) { 
    if (!confirm('هل أنت متأكد من حذف هذا الحجز؟')) return; 
    const bookingIndex = db.allBookings.findIndex(b => b.id === bookingId); 
    if (bookingIndex > -1) { 
        db.allBookings.splice(bookingIndex, 1); 
        db.chatMessages = db.chatMessages.filter(m => m.bookingId !== bookingId); 
        saveData(db); 
        addNotification(`تم حذف الحجز #${bookingId}.`); 
        showAdminSection('bookings'); 
    } 
}

function renderAllTournaments() { 
    if (db.tournaments.length === 0) return '<p class="text-center">لا توجد بطولات.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>الاسم</th><th>الرياضة</th><th>المنشأة</th><th>التاريخ</th><th>رسوم التسجيل</th><th>المسجلون</th></tr></thead><tbody>';
    db.tournaments.forEach(t => { 
        html += `<tr>
            <td>${t.name}</td>
            <td>${getSportName(t.sport)}</td>
            <td>${t.venue.name}</td>
            <td>${t.date}</td>
            <td>${t.fee} ريال</td>
            <td>${t.registeredPlayers.length}</td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function renderDiscountManagement() { 
    let html = `<h3>إنشاء كود خصم جديد</h3>
    <form id="adminDiscountForm" onsubmit="createAdminDiscount(event)">
        <div class="form-group" style="display: flex; gap: 10px;">
            <input type="text" id="adminDiscountCode" placeholder="كود الخصم" required style="flex: 1;">
            <input type="number" id="adminDiscountPercent" placeholder="نسبة الخصم %" min="1" max="100" required style="flex: 1;">
            <button type="submit" class="btn btn-success">
                <i class="fas fa-plus"></i> إنشاء
            </button>
        </div>
    </form>
    <h3 style="margin-top: 40px;">الأكواد الحالية</h3>`;
    
    if (db.discountCodes.length === 0) { 
        html += '<p class="text-center">لا توجد أكواد خصوم متاحة.</p>'; 
    } else { 
        html += '<table class="admin-table"><thead><tr><th>كود الخصم</th><th>نسبة الخصم (%)</th><th>إجراء</th></tr></thead><tbody>';
        db.discountCodes.forEach(d => { 
            html += `<tr>
                <td>${d.code}</td>
                <td>${d.percent}</td>
                <td class="actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteDiscount(${d.id})">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </td>
            </tr>`; 
        });
        html += '</tbody></table>'; 
    } 
    return html;
}

function createAdminDiscount(event) { 
    event.preventDefault(); 
    const code = document.getElementById('adminDiscountCode').value; 
    const percent = parseInt(document.getElementById('adminDiscountPercent').value); 
    db.discountCodes.push({ id: Date.now(), code, percent }); 
    saveData(db); 
    addNotification(`تم إنشاء كود خصم جديد: ${code}`); 
    showAdminSection('discounts'); 
}

function deleteDiscount(discountId) { 
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return; 
    const index = db.discountCodes.findIndex(d => d.id === discountId); 
    if (index > -1) { 
        db.discountCodes.splice(index, 1); 
        saveData(db); 
        addNotification('تم حذف كود الخصم.'); 
        showAdminSection('discounts'); 
    } 
}

function approveOwner(ownerId) {
    const ownerIndex = db.pendingOwnerAccounts.findIndex(o => o.id === ownerId);
    if (ownerIndex > -1) {
        const approvedOwner = db.pendingOwnerAccounts[ownerIndex];
        db.approvedOwners.push(approvedOwner);
        db.pendingOwnerAccounts.splice(ownerIndex, 1);
        saveData(db);
        addNotification(`تمت الموافقة على حساب ${approvedOwner.name}!`);
        showAdminSection('approvals');
    }
}

// --- Owner Dashboard Logic ---
function showOwnerSection(section) {
    const content = document.getElementById('ownerContent');
    if (event && event.target && event.target.tagName === 'A') { 
        const links = document.querySelectorAll('.owner-sidebar a'); 
        links.forEach(l => l.classList.remove('active')); 
        event.target.classList.add('active'); 
    }
    
    switch(section) {
        case 'overview': content.innerHTML = `<h2>نظرة عامة</h2>${renderOwnerStats()}`; break;
        case 'venues': content.innerHTML = `<h2>المنشآت الخاصة بي</h2>${renderOwnerVenues()}`; break;
        case 'add-venue': content.innerHTML = `<h2>إضافة منشأة جديدة</h2>${renderAddVenueForm('owner')}`; break;
        case 'bookings': content.innerHTML = `<h2>إدارة الحجوزات</h2>${renderOwnerBookings()}`; break;
        case 'tournaments': content.innerHTML = `<h2>إدارة البطولات</h2>${renderOwnerTournaments()}`; break;
    }
}

function renderOwnerStats() {
    const ownerVenues = db.publishedVenues.filter(s => s.ownerId === currentLoggedInUser.id);
    const ownerBookings = db.allBookings.filter(b => b.venue.ownerId === currentLoggedInUser.id);
    const revenue = ownerBookings.reduce((sum, b) => sum + b.finalPrice, 0);
    const stats = `<ul class="stats-grid">
        <li class="stat-card"><h3>${revenue}</h3><p>إجمالي الأرباح (ريال)</p></li>
        <li class="stat-card"><h3>${ownerBookings.length}</h3><p>إجمالي الحجوزات</p></li>
        <li class="stat-card"><h3>${ownerVenues.length}</h3><p>المنشآت التي تديرها</p></li>
    </ul>`;
    return stats;
}

function renderOwnerVenues() {
    const ownerVenues = db.publishedVenues.filter(s => s.ownerId === currentLoggedInUser.id);
    if (ownerVenues.length === 0) return '<p class="text-center">لا توجد منشآت مرتبطة بحسابك. يمكنك إضافة منشأة جديدة من القائمة الجانبية.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>الاسم</th><th>الرياضة</th><th>المدينة</th><th>التواصل</th><th>الإجراءات</th></tr></thead><tbody>';
    ownerVenues.forEach(s => {
        html += `<tr>
            <td>${s.name}</td>
            <td>${getSportName(s.sport)}</td>
            <td>${s.city}</td>
            <td>${s.contact}</td>
            <td class="actions">
                <button class="btn btn-danger btn-sm" onclick="deleteOwnerVenue(${s.id})">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function deleteOwnerVenue(venueId) { 
    if (!confirm('هل أنت متأكد من حذف هذه المنشأة؟')) return; 
    const index = db.publishedVenues.findIndex(s => s.id === venueId); 
    if (index > -1) { 
        db.publishedVenues.splice(index, 1); 
        saveData(db); 
        addNotification(`تم حذف المنشأة.`); 
        showOwnerSection('venues'); 
    } 
}

function renderOwnerBookings() {
    const ownerBookings = db.allBookings.filter(b => b.venue.ownerId === currentLoggedInUser.id);
    if (ownerBookings.length === 0) return '<p class="text-center">لا توجد حجوزات على منشآتك حالياً.</p>';
    
    let html = '<table class="admin-table"><thead><tr><th>المنشأة</th><th>اللاعب</th><th>التاريخ</th><th>الوقت</th><th>السعر</th><th>حالة الدفع</th></tr></thead><tbody>';
    ownerBookings.forEach(b => {
        let statusText = 'مؤكد'; 
        let statusClass = 'message success';
        if (b.paymentStatus === 'pending_payment_confirmation') { 
            statusText = 'في انتظار التأكيد'; 
            statusClass = 'message error'; 
        }
        html += `<tr>
            <td>${b.venue.name}</td>
            <td>${b.playerName}</td>
            <td>${b.date}</td>
            <td>${b.time}</td>
            <td>${b.finalPrice} ريال</td>
            <td><span class="${statusClass}" style="padding: 5px 10px; border-radius: 5px; display:inline-block;">${statusText}</span></td>
        </tr>`; 
    });
    html += '</tbody></table>'; 
    return html;
}

function renderOwnerTournaments() {
    const ownerTourns = db.tournaments.filter(t => t.venue.ownerId === currentLoggedInUser.id);
    if (ownerTourns.length === 0) return '<p class="text-center">لم تقم بإنشاء أي بطولات بعد. <button class="btn btn-primary" onclick="showPage(\'createTournamentPage\')"><i class="fas fa-plus"></i> إنشاء بطولة جديدة</button></p>';
    
    let html = '<table class="admin-table"><thead><tr><th>الاسم</th><th>المنشأة</th><th>التاريخ</th><th>رسوم التسجيل</th><th>المسجلون</th><th>الإجراءات</th></tr></thead><tbody>';
    ownerTourns.forEach(t => {
        html += `<tr>
            <td>${t.name}</td>
            <td>${t.venue.name}</td>
            <td>${t.date}</td>
            <td>${t.fee} ريال</td>
            <td>${t.registeredPlayers.length}</td>
            <td class="actions">
                <button class="btn btn-primary btn-sm" onclick="editTournament(${t.id})">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteTournament(${t.id})">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        </tr>`; 
    });
    html += '</tbody></table><div class="btn-group mt-20"><button class="btn btn-primary" onclick="showPage(\'createTournamentPage\')"><i class="fas fa-plus"></i> إنشاء بطولة جديدة</button></div>'; 
    return html;
}

function deleteTournament(tournamentId) { 
    if (!confirm('هل أنت متأكد من حذف هذه البطولة؟')) return; 
    const index = db.tournaments.findIndex(t => t.id === tournamentId); 
    if (index > -1) { 
        db.tournaments.splice(index, 1); 
        saveData(db); 
        addNotification('تم حذف البطولة.'); 
        showOwnerSection('tournaments'); 
    } 
}

function editTournament(tournamentId) { 
    alert('سيتم تطوير هذه الميزة قريباً'); 
}

// --- Tournaments ---
document.getElementById('createTournamentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const venueId = parseInt(document.getElementById('tournamentVenue').value);
    const newTournament = { 
        id: Date.now(), 
        sport: document.getElementById('tournamentSport').value, 
        venueId, 
        venue: db.publishedVenues.find(s => s.id === venueId), 
        name: document.getElementById('tournamentName').value, 
        date: document.getElementById('tournamentDate').value, 
        fee: parseInt(document.getElementById('tournamentFee').value), 
        details: document.getElementById('tournamentDetails').value, 
        registeredPlayers: [] 
    };
    db.tournaments.push(newTournament);
    saveData(db);
    addNotification(`بطولة جديدة: ${newTournament.name}`);
    alert('تم إنشاء البطولة بنجاح!');
    showOwnerSection('tournaments');
});

function populateVenueSelect() {
    const select = document.getElementById('tournamentVenue'); 
    select.innerHTML = '';
    const sport = document.getElementById('tournamentSport').value;
    const ownerVenues = db.publishedVenues.filter(s => s.ownerId === currentLoggedInUser.id && s.sport === sport);
    ownerVenues.forEach(s => { 
        const option = document.createElement('option'); 
        option.value = s.id; 
        option.textContent = s.name; 
        select.appendChild(option); 
    });
}

function displayAllTournaments() {
    const container = document.getElementById('tournamentsListContainer'); 
    container.innerHTML = '';
    if (db.tournaments.length === 0) { 
        container.innerHTML = '<p class="text-center">لا توجد بطولات متاحة حالياً.</p>'; 
        return; 
    }
    db.tournaments.forEach(t => {
        const card = document.createElement('div'); 
        card.className = 'tournament-card';
        card.innerHTML = `
            <h4>${t.name}</h4>
            <p><strong>الرياضة:</strong> ${getSportName(t.sport)}</p>
            <p>المنشأة: ${t.venue.name}</p>
            <p>التاريخ: ${t.date}</p>
            <p>رسوم التسجيل: ${t.fee} ريال</p>
            <p>${t.details}</p>
            <p>المسجلون: ${t.registeredPlayers.length}</p>
        `;
        container.appendChild(card);
    });
}

// --- Reviews ---
function getAverageRating(venueId) { 
    const venueReviews = db.reviews.filter(r => r.venueId === venueId); 
    if (venueReviews.length === 0) return 0; 
    const sum = venueReviews.reduce((acc, r) => acc + r.rating, 0); 
    return sum / venueReviews.length; 
}

function generateStars(rating) { 
    let stars = ''; 
    for (let i = 1; i <= 5; i++) { 
        stars += `<span class="star ${i <= rating ? 'filled' : ''}">&#9733;</span>`; 
    } 
    return stars; 
}

function renderReviews(venueId) { 
    const venueReviews = db.reviews.filter(r => r.venueId === venueId); 
    if (venueReviews.length === 0) return '<p>لا توجد تقييمات بعد.</p>'; 
    return venueReviews.map(r => `
        <div class="review-item">
            <div class="review-header">
                <strong>${r.playerName}</strong>
                <div class="rating">${generateStars(r.rating)}</div>
            </div>
            <p>${r.comment}</p>
        </div>
    `).join(''); 
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    showPage('mainMenuPage');
    renderNotifications();

    // Add dummy data only if database is completely empty
    if (db.approvedOwners.length === 0 && db.publishedVenues.length === 0) {
        db.approvedOwners.push({
            id:1, 
            name:'شبيب الشبيبي', 
            email:'owner@test.com', 
            password:'123', 
            type:'owner'
        });
        
        db.publishedVenues.push(
            { 
                id: 101, 
                ownerId: 1, 
                ownerName:'شبيب الشبيبي', 
                sport: 'football', 
                name:'ملعب الأحلام', 
                city:'الرياض', 
                contact:'966-50-123-4567', 
                location:'شارع الملك فهد', 
                lat: 24.7136,
                lng: 46.6753,
                surface:'عشبي صناعي', 
                size:'7vs7', 
                lights:true, 
                priceOffPeak:100, 
                pricePeak:150, 
                details:'ملعب ممتاز', 
                openingHour:16, 
                closingHour:23, 
                slotDuration:60 
            },
            { 
                id: 102, 
                ownerId: null, 
                ownerName:'غير معين', 
                sport: 'volleyball', 
                name:'شاطئ الأبطال', 
                city:'جدة', 
                contact:'966-50-987-6543', 
                location:'الكورنيش', 
                lat: 21.5433,
                lng: 39.1728,
                surface:'رمل', 
                size:'مقاس واحد', 
                lights:true, 
                priceOffPeak:80, 
                pricePeak:120, 
                details:'ملعب شاطئي رائع', 
                openingHour:17, 
                closingHour:22, 
                slotDuration:60 
            },
            { 
                id: 103, 
                ownerId: null, 
                ownerName:'غير معين', 
                sport: 'esports', 
                name:'مركز الألعاب الملكي', 
                city:'الرياض', 
                contact:'968........', 
                location:'شارع السلطان قابوس', 
                lat: 24.7247,
                lng: 46.6803,
                surface:'كمبيوتر', 
                size:'غرفة فردية', 
                lights:true, 
                priceOffPeak:30, 
                pricePeak:50, 
                details:'أحدث الأجهزة ومعدات عالية الجودة', 
                openingHour:10, 
                closingHour:24, 
                slotDuration:60, 
                equipmentCount: 20, 
                availableGames: ['FIFA', 'PES', 'Fortnite', 'PUBG'] 
            }
        );
        
        db.discountCodes.push({
            id:1, 
            code:'WELCOME10', 
            percent:10
        });
        
        addNotification('مرحباً بك في منصة ملعبي!');
        saveData(db);
    }
});