/* ==========================================================
   1. NAVIGATION MENU (MOBILE)
========================================================== */
function myMenuFunction() {
    var menuBtn = document.getElementById("myNavMenu");
    // Toggle the 'responsive' class to show/hide the menu
    if (menuBtn.className === "nav-menu") {
        menuBtn.className += " responsive";
    } else {
        menuBtn.className = "nav-menu";
    }
}

/* ==========================================================
   2. SHADOW ON SCROLL
========================================================== */
// Adds a subtle shadow to the header when you scroll down
window.onscroll = function() { headerShadow() };

function headerShadow() {
    const navHeader = document.getElementById("header");

    if (document.body.scrollTop > 50 || document.documentElement.scrollTop > 50) {
        navHeader.style.boxShadow = "0 1px 6px rgba(0, 0, 0, 0.1)";
        navHeader.style.height = "70px";
        navHeader.style.lineHeight = "70px";
    } else {
        navHeader.style.boxShadow = "none";
        navHeader.style.height = "80px";
        navHeader.style.lineHeight = "80px";
    }
}

/* ==========================================================
   3. DARK / LIGHT MODE TOGGLE
========================================================== */
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const body = document.body;

// Check local storage for saved theme preference
const savedTheme = localStorage.getItem('theme');

if (savedTheme === 'light') {
    body.classList.add('light-mode');
    themeIcon.classList.remove('uil-moon');
    themeIcon.classList.add('uil-sun');
}

// Toggle logic
themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-mode');
    const isLight = body.classList.contains('light-mode');
    
    // Switch Icon
    if (isLight) {
        themeIcon.classList.remove('uil-moon');
        themeIcon.classList.add('uil-sun');
        localStorage.setItem('theme', 'light');
    } else {
        themeIcon.classList.remove('uil-sun');
        themeIcon.classList.add('uil-moon');
        localStorage.setItem('theme', 'dark');
    }
});

/* ==========================================================
   4. SCROLL REVEAL ANIMATION
========================================================== */
// This makes elements fade in as you scroll
const sr = ScrollReveal({
    origin: 'top',
    distance: '60px',
    duration: 2000,
    reset: true     // Animations repeat when you scroll back up
});

// -- Reveal General Sections --
sr.reveal('.section-header', { delay: 100 });
sr.reveal('.professional-summary', { delay: 200 });

// -- Reveal About Section --
sr.reveal('.about-info', { origin: 'left', delay: 200 });
sr.reveal('.about-avatar', { origin: 'right', delay: 200 });
sr.reveal('.skills-box', { interval: 200 }); // Staggers the animation for skills

// -- Reveal Experience & Projects --
sr.reveal('.experience-box', { interval: 200 });
sr.reveal('.project-box', { interval: 200 });
sr.reveal('.achievements-list', { delay: 200 });

/* ==========================================================
   5. SCROLL ACTIVE LINK
========================================================== */
// Highlights the navbar link corresponding to the current section
const sections = document.querySelectorAll('section[id]');

function scrollActive() {
    const scrollY = window.scrollY;

    sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 100; // Offset for header height
        const sectionId = current.getAttribute('id');
        
        // Find the link that points to this section
        const sectionLink = document.querySelector('.nav-menu a[href*=' + sectionId + ']');

        if (sectionLink) {
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                sectionLink.classList.add('active-link');
            } else {
                sectionLink.classList.remove('active-link');
            }
        }
    });
}
window.addEventListener('scroll', scrollActive);