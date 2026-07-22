(() => {
  'use strict';

  const cinematic = document.querySelector('.cinematic');
  const world = cinematic && cinematic.querySelector('.cinema-world');
  const host = cinematic && cinematic.querySelector('[data-cinematic-media]');
  if (!cinematic || !world || !host) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const smallViewport = matchMedia('(max-width: 860px)');
  const phoneClass = Math.min(screen.width, screen.height, innerWidth, innerHeight) <= 600;
  const connection = navigator.connection;
  const saveData = Boolean(connection && connection.saveData);
  const stillsOnly = reduceMotion || saveData;
  let staticFallback = stillsOnly;

  const base = 'assets/cinematic/';
  const definitions = [
    { id: '01-start', still: 'still-01-start.webp', poster: '01-start-poster.webp', posterMobile: '01-start-poster-m.webp' },
    { id: '02-build', still: 'still-02-build.webp', poster: '02-build-poster.webp', posterMobile: '02-build-poster-m.webp' },
    { id: '03-direct', still: 'still-03-direct.webp', poster: '03-direct-poster.webp', posterMobile: '03-direct-poster-m.webp' },
    { id: '04-run', still: 'still-04-run.webp', poster: '04-run-poster.webp', posterMobile: '04-run-poster-m.webp' }
  ];

  const segments = definitions.map((definition) => {
    const element = document.createElement('div');
    element.className = 'cinematic-media__segment';
    element.dataset.cinematicSegment = definition.id;

    const still = document.createElement('img');
    still.className = 'cinematic-media__still';
    still.alt = '';
    still.decoding = 'async';
    still.loading = definition.id === '01-start' ? 'eager' : 'lazy';
    const loadingArtwork = stillsOnly
      ? definition.still
      : (phoneClass ? definition.posterMobile : definition.poster);
    still.src = base + loadingArtwork;
    still.addEventListener('load', () => world.classList.add('has-cinematic-fallback'), { once: true });
    still.addEventListener('error', () => {
      const fallback = base + definition.still;
      if (still.src !== new URL(fallback, document.baseURI).href) {
        still.src = fallback;
      } else {
        still.remove();
      }
    });
    element.appendChild(still);
    host.appendChild(element);

    return {
      ...definition,
      element,
      still,
      video: null,
      objectUrl: '',
      loading: false,
      ready: false,
      painted: false,
      current: 0,
      target: 0
    };
  });

  let activeIndex = -1;
  let userReady = false;
  let reading = false;

  const isTouchLayout = () => coarse || smallViewport.matches;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  const clipPath = (segment) => {
    const suffix = phoneClass ? '-m.mp4' : '.mp4';
    return base + 'vid/' + segment.id + suffix;
  };

  const enterStaticFallback = () => {
    staticFallback = true;
    segments.forEach((segment) => {
      if (segment.video) {
        try { segment.video.pause(); } catch (_) {}
        segment.video.remove();
      }
      if (segment.objectUrl) URL.revokeObjectURL(segment.objectUrl);
      segment.video = null;
      segment.objectUrl = '';
      segment.ready = false;
      segment.loading = false;
    });
    world.classList.remove('has-cinematic-video');
    world.classList.add('has-cinematic-fallback');
  };

  const primeVideo = (video) => {
    if (!video || !isTouchLayout()) return;
    try {
      const promise = video.play();
      if (promise && promise.then) {
        promise.then(() => video.pause()).catch(enterStaticFallback);
      }
    } catch (_) {}
  };

  const loadClip = (segment) => {
    if (staticFallback || segment.loading || segment.video) return;
    segment.loading = true;

    fetch(clipPath(segment))
      .then((response) => {
        if (!response.ok) throw new Error('cinematic clip unavailable');
        return response.blob();
      })
      .then((blob) => {
        const video = document.createElement('video');
        video.className = 'cinematic-media__video';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');

        segment.objectUrl = URL.createObjectURL(blob);
        video.src = segment.objectUrl;
        video.addEventListener('loadedmetadata', () => {
          segment.ready = true;
          read();
        });
        video.addEventListener('seeked', () => {
          if (!segment.painted) {
            segment.painted = true;
            segment.element.classList.add('has-painted-video');
            world.classList.add('has-cinematic-video');
          }
        });
        video.addEventListener('loadeddata', () => {
          video.pause();
          if (userReady) primeVideo(video);
        });
        segment.element.appendChild(video);
        segment.video = video;
      })
      .catch(() => {
        segment.loading = false;
      });
  };

  const read = () => {
    const travel = Math.max(1, cinematic.offsetHeight - innerHeight);
    const progress = clamp((scrollY - cinematic.offsetTop) / travel);
    const exact = progress * segments.length;
    const index = Math.min(segments.length - 1, Math.floor(exact));
    const local = index === segments.length - 1 && progress === 1 ? 1 : exact - index;

    segments.forEach((segment, segmentIndex) => {
      const distance = Math.abs(segmentIndex - index);
      segment.target = segmentIndex === index ? clamp(local) : (segmentIndex < index ? 1 : 0);
      segment.element.classList.toggle('is-visible', segmentIndex === index);
      if (distance <= 1) loadClip(segment);
    });

    if (activeIndex !== index) activeIndex = index;
    reading = false;
  };

  const animate = () => {
    const epsilon = isTouchLayout() ? .02 : .008;
    segments.forEach((segment) => {
      const video = segment.video;
      if (!video || !segment.ready || video.seeking) return;
      segment.current += (segment.target - segment.current) * .2;
      const time = clamp(segment.current, 0, .999) * (video.duration || 1);
      if (Math.abs(video.currentTime - time) > epsilon) {
        try { video.currentTime = time; } catch (_) {}
      }
    });
    requestAnimationFrame(animate);
  };

  const queueRead = () => {
    if (reading) return;
    reading = true;
    requestAnimationFrame(read);
  };

  const onFirstGesture = () => {
    if (userReady) return;
    userReady = true;
    segments.forEach((segment) => primeVideo(segment.video));
  };

  addEventListener('scroll', queueRead, { passive: true });
  addEventListener('resize', queueRead, { passive: true });
  addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  addEventListener('touchstart', onFirstGesture, { once: true, passive: true });
  addEventListener('pagehide', () => {
    segments.forEach((segment) => {
      if (segment.objectUrl) URL.revokeObjectURL(segment.objectUrl);
    });
  }, { once: true });

  read();
  requestAnimationFrame(animate);
})();
