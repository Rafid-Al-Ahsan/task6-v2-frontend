const socket = io('https://task6-three-iota.vercel.app', {
    transports: ['polling'],  // Use polling instead of WebSockets
});

// Error handling
socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
});

// Initialize drawing variables
let isDrawing = false;
let isErasing = false; 
let x = 0, y = 0;
let currentSlideId = null;
const drawings = {};
let userRole = 'viewer'; 

// Prompt for user input
const nickname = prompt("Enter your nickname") || 'Guest'; // Default to 'Guest' if empty
const presentationId = prompt("Enter presentation ID or create new") || 'default'; // Default if empty

// Emit event to join presentation
socket.emit('join_presentation', { presentationId, nickname });

// Handle user updates
socket.on('update_users', (users) => {
    const user = users[socket.id];
    userRole = user.role;

    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    Object.keys(users).forEach(userId => {
        const user = users[userId];
        const userItem = document.createElement('li');
        userItem.className = 'py-1 border-b border-gray-200 flex justify-between items-center';
        userItem.textContent = `${user.nickname} (${user.role})`;

        const toggleButton = document.createElement('button');
        toggleButton.className = `ml-2 py-1 px-2 rounded transition ${user.role === 'editor' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-blue-500 text-white hover:bg-blue-600'}`;
        toggleButton.textContent = user.role === 'editor' ? 'Revoke Edit' : 'Make Editor';

        toggleButton.onclick = () => {
            const newRole = user.role === 'editor' ? 'viewer' : 'editor';
            socket.emit('assign_role', { userId, role: newRole });
        };

        userItem.appendChild(toggleButton);
        usersList.appendChild(userItem);
    });
});

// Handle slide updates
const slidesContainer = document.getElementById('slides');
socket.on('slides_updated', (slides) => {
    slidesContainer.innerHTML = '';
    slides.forEach((slide, index) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'bg-gray-200 text-center p-2 mb-2 cursor-pointer rounded hover:bg-gray-300 transition';
        slideDiv.textContent = `Slide ${index + 1}`;
        slideDiv.addEventListener('click', () => showSlide(index));
        slidesContainer.appendChild(slideDiv);
    });
});

// Handle drawings update
socket.on('drawings_updated', (drawingsData) => {
    Object.keys(drawingsData).forEach(slideId => {
        drawings[slideId] = drawingsData[slideId];
    });

    // Render drawings for the current slide
    if (currentSlideId !== null) {
        renderDrawings(currentSlideId);
    }
});

// Event listener for adding slides
document.getElementById('add-slide').addEventListener('click', () => {
    socket.emit('add_slide');
});

// Handle slide updates
socket.on('slide_updated', ({ slideId, content }) => {
    if (document.getElementById('slide-area').textContent.includes(`Slide ${slideId}`)) {
        document.getElementById('slide-area').textContent = content;
    }
});

// Event listener for eraser mode
document.getElementById('eraser-mode').addEventListener('click', () => {
    isErasing = !isErasing;
    const button = document.getElementById('eraser-mode');
    button.classList.toggle('bg-gray-500', isErasing);
    button.classList.toggle('hover:bg-gray-600', isErasing);
    button.textContent = isErasing ? 'Drawing' : 'Eraser';
});

// Show specific slide
function showSlide(slideId) {
    currentSlideId = slideId;
    const slideArea = document.getElementById('slide-area');
    slideArea.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.width = slideArea.clientWidth;
    canvas.height = slideArea.clientHeight;
    canvas.dataset.slideId = slideId; 
    slideArea.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Draw previously saved lines
    renderDrawings(slideId);

    // Allow drawing for editors only
    if (userRole === 'editor') {
        setupCanvasEvents(canvas, ctx, slideId);
    }

    socket.on('draw_line', ({ slideId: receivedSlideId, x, y, newX, newY }) => {
        if (receivedSlideId === currentSlideId) {
            drawLine(ctx, x, y, newX, newY);
            if (!drawings[receivedSlideId]) {
                drawings[receivedSlideId] = [];
            }
            drawings[receivedSlideId].push({ x, y, newX, newY });
        }
    });

    socket.on('erase_line', ({ slideId: receivedSlideId, newX, newY }) => {
        if (receivedSlideId === currentSlideId) {
            eraseLine(ctx, newX, newY);
        }
    });
}

function setupCanvasEvents(canvas, ctx, slideId) {
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
        isDrawing = true;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            const rect = canvas.getBoundingClientRect();
            const newX = e.clientX - rect.left;
            const newY = e.clientY - rect.top;

            if (isErasing) {
                eraseLine(ctx, newX, newY);
                socket.emit('erase', { presentationId, slideId, newX, newY });
            } else {
                drawLine(ctx, x, y, newX, newY);
                socket.emit('draw', { presentationId, slideId, x, y, newX, newY });
                if (!drawings[slideId]) {
                    drawings[slideId] = [];
                }
                drawings[slideId].push({ x, y, newX, newY });
            }

            x = newX;
            y = newY;
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });
    canvas.addEventListener('mouseout', () => {
        isDrawing = false;
    });
}

// Function to render drawings on the canvas
function renderDrawings(slideId) {
    const slideArea = document.getElementById('slide-area');
    const canvas = slideArea.querySelector(`canvas[data-slide-id="${slideId}"]`);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas before redrawing
        if (drawings[slideId]) {
            drawings[slideId].forEach(({ x, y, newX, newY }) => {
                drawLine(ctx, x, y, newX, newY);
            });
        }
    }
}

function drawLine(ctx, x, y, newX, newY) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(newX, newY);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
}

function eraseLine(ctx, newX, newY) {
    ctx.clearRect(newX - 10, newY - 10, 20, 20); // Clear a small area around the mouse position
}

// Event listener for PDF export
document.getElementById('export-pdf').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF(); // Create a new jsPDF instance

    let currentSlideIndex = 0;

    // Iterate over all slides
    Object.keys(drawings).forEach((slideId, index) => {
        const slideCanvas = document.createElement('canvas');
        slideCanvas.width = 300; // Adjust as necessary
        slideCanvas.height = 200; // Adjust as necessary
        const slideCtx = slideCanvas.getContext('2d');

        // Render each slide's drawings onto the canvas
        drawings[slideId].forEach(({ x, y, newX }) => {
            drawLine(slideCtx, x, y, newX, newY);
        });

        doc.addPage();
        doc.addImage(slideCanvas.toDataURL('image/png'), 'PNG', 10, 10);
        doc.text(`Slide ${index + 1}`, 10, 10);
    });

    // Save the PDF
    doc.save('presentation.pdf');
});
    