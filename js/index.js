
// overlay (SVG path element)
const overlayPath = document.querySelector('.overlay__path');

// menu (wrap) element
const menuWrap = document.querySelector('.menu-wrap');

// menu items
const menuItems = menuWrap.querySelectorAll('.menu__item');

// open menu trigger (ChessPiece card)
const openMenuCtrl = document.querySelector('#chessPieceInfoBtn');

// close menu button
const closeMenuCtrl = menuWrap.querySelector('.button-close');

// big title elements

const contentContainer = document.querySelector('.content');

const title = {
    main: document.querySelector('.content__title-main'),
    sub: document.querySelector('.content__title-sub')
};

let isAnimating = false;

// opens the menu
const openMenu = ()  => {
    
    if ( isAnimating ) return;
    isAnimating = true;
    gsap.timeline({
            onComplete: () => isAnimating = false
        })
        .set(overlayPath, {
            attr: { d: 'M 0 100 V 100 Q 50 100 100 100 V 100 z' }
        })
        .to(overlayPath, { 
            duration: 0.8,
            ease: 'power4.in',
            attr: { d: 'M 0 100 V 50 Q 50 0 100 50 V 100 z' }
        }, 0)
        .to(overlayPath, { 
            duration: 0.3,
            ease: 'power2',
            attr: { d: 'M 0 100 V 0 Q 50 0 100 0 V 100 z' },
            onComplete: () => {
                menuWrap.classList.add('menu-wrap--open');

            }
        })
        // title elements
        .to(contentContainer, { 
            duration: 0.8,
            ease: 'power3.in',
            y: -200,
            stagger: 0.05
        }, 0.2)

        // now reveal
        .set(menuItems, { 
            opacity: 0
        })
        .set(overlayPath, { 
            attr: { d: 'M 0 0 V 100 Q 50 100 100 100 V 0 z' }
        })
        .to(overlayPath, { 
            duration: 0.3,
            ease: 'power2.in',
            attr: { d: 'M 0 0 V 50 Q 50 0 100 50 V 0 z' }
        })
        .to(overlayPath, { 
            duration: 0.8,
            ease: 'power4',
            attr: { d: 'M 0 0 V 0 Q 50 0 100 0 V 0 z' }
        })
        // menu items translate animation
        .to(menuItems, { 
            duration: 1.1,
            ease: 'power4',
            startAt: {y: 150},
            y: 0,
            opacity: 1,
            stagger: 0.05
        }, '>-=1.1');

}

// closes the menu
const closeMenu = ()  => {
    
    if ( isAnimating ) return;
    isAnimating = true;
    gsap.timeline({
            onComplete: () => isAnimating = false
        })
        .set(overlayPath, {
            attr: { d: 'M 0 0 V 0 Q 50 0 100 0 V 0 z' }
        })
        .to(overlayPath, { 
            duration: 0.8,
            ease: 'power4.in',
            attr: { d: 'M 0 0 V 50 Q 50 100 100 50 V 0 z' }
        }, 0)
        .to(overlayPath, { 
            duration: 0.3,
            ease: 'power2',
            attr: { d: 'M 0 0 V 100 Q 50 100 100 100 V 0 z' },
            onComplete: () => {
                menuWrap.classList.remove('menu-wrap--open');
            }
        })
        // now reveal
        .set(overlayPath, { 
            attr: { d: 'M 0 100 V 0 Q 50 0 100 0 V 100 z' }
        })
        .to(overlayPath, { 
            duration: 0.3,
            ease: 'power2.in',
            attr: { d: 'M 0 100 V 50 Q 50 100 100 50 V 100 z' }
        })
        .to(overlayPath, { 
            duration: 0.8,
            ease: 'power4',
            attr: { d: 'M 0 100 V 100 Q 50 100 100 100 V 100 z' }
        })
        // title elements
        .to(contentContainer, { 
            duration: 1.1,
            ease: 'power4',
            y: 0,
            stagger: -0.05
        }, '>-=1.1')
        // menu items translate animation
        .to(menuItems, { 
            duration: 0.8,
            ease: 'power2.in',
            y: 100,
            opacity: 0,
            stagger: -0.05
        }, 0)

}


// click on menu trigger
if (openMenuCtrl) {
    openMenuCtrl.addEventListener('click', openMenu);
    openMenuCtrl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openMenu();
        }
    });
}
// click on close menu button
if (closeMenuCtrl) {
    closeMenuCtrl.addEventListener('click', closeMenu);
}
