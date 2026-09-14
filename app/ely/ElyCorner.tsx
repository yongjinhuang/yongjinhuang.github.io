'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './ely.module.css';

type Memory = {
  id: string;
  date: string;
  title: string;
  description: string;
  label: string;
  kind: 'letter' | 'light' | 'ninety';
  html: string;
};
type Album = { memories: Memory[] };
type EncryptedAlbum = {
  version: number;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function bytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function SmallIcon({ name }: { name: 'key' | 'lock' | 'arrow' | 'back' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'key' && (
        <>
          <circle cx="8" cy="9" r="4" />
          <path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" />
        </>
      )}
      {name === 'lock' && (
        <>
          <rect x="6" y="10" width="12" height="10" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v1" />
        </>
      )}
      {name === 'arrow' && <path d="M4 12h15m-5-5 5 5-5 5" />}
      {name === 'back' && <path d="M20 12H5m5-5-5 5 5 5" />}
    </svg>
  );
}

function LittleCat({
  x,
  y,
  scale = 1,
  coat,
  patch,
}: {
  x: number;
  y: number;
  scale?: number;
  coat: string;
  patch?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M39 55c24 3 27-13 18-18"
        stroke={coat}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M10 60c-4-12 0-27 6-33h23c8 8 12 24 7 33Z" fill={coat} />
      <path d="m10 20 1-18 14 10h7L46 2l1 19c6 19-42 22-37-1Z" fill={coat} />
      <path d="m14 15 1-7 7 6m14 0 7-6v8" fill="#dca8a6" />
      {patch && <path d="M29 10h3L46 2l1 19c-4 5-10 5-15 1Z" fill={patch} />}
      <path
        d="m18 23 3 1 3-1m10 0 3 1 3-1"
        stroke="#675552"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="m27 27 3 3 3-3" fill="#bb8486" />
      <path
        d="M30 30v3m-5 22v6m10-6v6"
        stroke="#8e7971"
        strokeOpacity=".5"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m8 26-7-2m7 6-7 1m47-5 7-2m-7 6 7 1"
        stroke="#a58c84"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <ellipse cx="19" cy="60" rx="9" ry="3" fill={coat} />
      <ellipse cx="38" cy="60" rx="9" ry="3" fill={coat} />
    </g>
  );
}

function LittleDog({
  x = 325,
  y = 328,
  scale = 0.88,
}: {
  x?: number;
  y?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M46 47q28-8 20-22"
        stroke="#c69c78"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path d="M15 32c-7 9-8 23-3 30h38c5-15-1-26-10-30Z" fill="#cba17d" />
      <ellipse cx="30" cy="49" rx="11" ry="16" fill="#f4e3cd" />
      <path d="M9 19C7-5 48-6 51 17l-1 13c-8 15-35 13-40 0Z" fill="#dfb88f" />
      <path
        d="M12 7C-1 2-8 27 1 33c9 4 18-19 11-26m33 0c13-5 20 20 11 26-9 4-18-19-11-26"
        fill="#aa7e60"
      />
      <ellipse cx="30" cy="29" rx="12" ry="9" fill="#f5e4d0" />
      <circle cx="19" cy="20" r="2" fill="#67524b" />
      <circle cx="40" cy="20" r="2" fill="#67524b" />
      <path d="M26 27q4-4 8 0l-4 4Z" fill="#67524b" />
      <path d="M27 34q3 10 6 0" fill="#d59c9d" />
      <path d="M14 39q16 6 31-1" stroke="#bf8794" strokeWidth="4" />
      <circle cx="30" cy="43" r="3" fill="#e7c586" />
      <ellipse cx="15" cy="62" rx="10" ry="4" fill="#dfb88f" />
      <ellipse cx="45" cy="62" rx="10" ry="4" fill="#dfb88f" />
    </g>
  );
}

function Door({
  open = false,
  pets = false,
}: {
  open?: boolean;
  pets?: boolean;
}) {
  return (
    <svg
      className={`${styles.door} ${open ? styles.doorOpen : ''}`}
      viewBox="0 0 430 430"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="216"
        cy="371"
        rx="159"
        ry="13"
        fill="#d8cbbd"
        opacity=".26"
      />
      <path d="M75 365V176a140 140 0 0 1 280 0v189" fill="#eee5de" />
      <path d="M98 365V177a117 117 0 0 1 234 0v188" fill="#efd2d1" />
      <path d="M123 364V178a92 92 0 0 1 184 0v186" fill="#9e6f79" />
      <path d="M131 364V180a84 84 0 0 1 168 0v184" fill="#ffeac5" />
      <g className={styles.doorLeaf}>
        <path d="M131 364V180a84 84 0 0 1 168 0v184" fill="#d4a2ac" />
        <path
          d="M144 352V181a71 71 0 0 1 142 0v171Z"
          stroke="#fff0ed"
          strokeOpacity=".55"
        />
        <path
          d="M163 200v-18a52 52 0 0 1 104 0v18Z"
          fill="#fbe5b8"
          stroke="#aa7885"
          strokeWidth="3"
        />
        <path d="M215 132v68m-52-27h104" stroke="#aa7885" strokeWidth="3" />
        {pets && <LittleCat x={197} y={162} scale={0.58} coat="#8c827f" />}
        <rect
          x="176"
          y="222"
          width="78"
          height="30"
          rx="4"
          fill="#f9f2e7"
          transform="rotate(-4 176 222)"
        />
        <text
          x="214"
          y="241"
          textAnchor="middle"
          fill="#9b6e7a"
          fontFamily="Georgia,serif"
          fontSize="16"
          fontStyle="italic"
          transform="rotate(-4 214 241)"
        >
          us, here.
        </text>
        <rect
          x="159"
          y="274"
          width="111"
          height="63"
          rx="3"
          stroke="#b88391"
          strokeOpacity=".65"
        />
        <circle cx="278" cy="263" r="6" fill="#f8deaa" stroke="#aa875a" />
      </g>
      <path d="M108 364h210l11 11H98Z" fill="#cbb7bc" />
      <ellipse cx="214" cy="396" rx="64" ry="14" fill="#e6d8c5" />
      <text
        x="214"
        y="400"
        textAnchor="middle"
        fill="#948573"
        fontFamily="Georgia,serif"
        fontSize="12"
        letterSpacing="2"
      >
        hello, you
      </text>
      <path
        d="M71 334q-15-43-2-79m3 45q-26-1-30-26 23-2 30 26m-1-16q25-3 29-26-24 2-29 26m-5-23q-16-18-9-34 19 15 9 34"
        fill="#a1aa87"
      />
      <path d="M49 328h43l-6 37H55Z" fill="#ccaaa0" />
      <path d="M47 328h47v7H47Z" fill="#d9b9ac" />
      <path
        d="M351 356v-54m0 32 17-12m-17 23-12-10"
        stroke="#9ca47e"
        strokeWidth="2"
      />
      <g fill="#fffbef">
        <ellipse cx="351" cy="292" rx="5" ry="10" />
        <ellipse cx="351" cy="312" rx="5" ry="10" />
        <ellipse cx="341" cy="302" rx="10" ry="5" />
        <ellipse cx="361" cy="302" rx="10" ry="5" />
      </g>
      <circle cx="351" cy="302" r="5" fill="#d5b56d" />
      {pets && (
        <g>
          <ellipse
            cx="116"
            cy="382"
            rx="40"
            ry="6"
            fill="#d8cbbd"
            opacity=".3"
          />
          <ellipse
            cx="321"
            cy="387"
            rx="64"
            ry="6"
            fill="#d8cbbd"
            opacity=".3"
          />
          <LittleCat
            x={78}
            y={330}
            scale={0.84}
            coat="#d5aa82"
            patch="#b58362"
          />
          <LittleCat
            x={128}
            y={341}
            scale={0.64}
            coat="#f8eee1"
            patch="#b0a39b"
          />
          <LittleCat x={271} y={338} scale={0.74} coat="#a59b97" />
          <LittleDog />
        </g>
      )}
      <path d="m335 140 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z" fill="#c7a16e" />
      <path d="m104 105 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill="#c7a16e" />
    </svg>
  );
}

function MemoryArt({ kind }: { kind: Memory['kind'] }) {
  return (
    <svg viewBox="0 0 220 180" fill="none" aria-hidden="true">
      {kind === 'letter' && (
        <>
          <ellipse
            cx="112"
            cy="141"
            rx="67"
            ry="7"
            fill="#cbb8a2"
            opacity=".25"
          />
          <g transform="rotate(-8 110 90)">
            <rect
              x="51"
              y="42"
              width="121"
              height="93"
              rx="4"
              fill="#f9f0de"
              stroke="#c6ad8f"
            />
            <path d="m52 132 60-49 59 49" stroke="#d7c2a6" />
            <path d="m52 45 59 49 60-49" fill="#f4e5ca" stroke="#c6ad8f" />
            <circle cx="112" cy="91" r="13" fill="#aa7781" />
            <path
              d="M112 96s-8-5-7-9 6-4 7 0c2-4 7-4 8 0s-8 9-8 9"
              fill="#ebcbd0"
            />
          </g>
          <path d="m179 39 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill="#b79d73" />
        </>
      )}
      {kind === 'light' && (
        <>
          <circle cx="109" cy="83" r="61" fill="#f1dba0" opacity=".18" />
          <circle cx="109" cy="83" r="44" fill="#f3dfb5" opacity=".3" />
          <path
            d="M109 38V28a9 9 0 0 1 18 0"
            stroke="#8b927c"
            strokeWidth="2"
          />
          <path
            d="M85 65h49l-5 64H90Z"
            fill="#fae9b7"
            stroke="#939780"
            strokeWidth="2"
          />
          <path
            d="m84 65 9-19h31l11 19M87 131h45"
            fill="#a1a58c"
            stroke="#899078"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M109 80v36"
            stroke="#ceaa61"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M109 77c-9-9 1-15 1-15s10 10-1 15" fill="#e5b968" />
          <path
            d="M159 133c-11-12-9-27-1-29l8 6 8-6c10 3 10 22 3 29m-16-11v11m10-11v11"
            fill="#b2a08c"
            stroke="#b2a08c"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse
            cx="116"
            cy="141"
            rx="64"
            ry="5"
            fill="#9c9e84"
            opacity=".18"
          />
        </>
      )}
      {kind === 'ninety' && (
        <>
          <g transform="rotate(7 110 90)">
            <rect
              x="59"
              y="29"
              width="103"
              height="124"
              rx="2"
              fill="#fff8f0"
              stroke="#d1b7b8"
            />
            <path d="M75 56h70M75 122h70M75 131h42" stroke="#ddcacc" />
            <text
              x="111"
              y="105"
              textAnchor="middle"
              fill="#a36f80"
              fontFamily="Georgia,serif"
              fontSize="53"
              fontStyle="italic"
            >
              99
            </text>
            <path
              d="m97 24 4 3 4-3 4 3 4-3 4 3 4-3 4 3v18l-4-3-4 3-4-3-4 3-4-3-4 3-4-3Z"
              fill="#d9acb4"
              opacity=".7"
            />
          </g>
          <path
            d="M172 123s-14-8-13-15 11-8 13-2c4-7 13-5 13 1s-13 16-13 16"
            fill="#bd8c98"
          />
        </>
      )}
    </svg>
  );
}

export default function ElyCorner() {
  const [album, setAlbum] = useState<Album | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entering, setEntering] = useState(false);
  const [active, setActive] = useState<Memory | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<string | null>(null);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    },
    []
  );

  useEffect(() => {
    if (album && !active) {
      const card =
        returnFocus.current && document.getElementById(returnFocus.current);
      if (card) card.focus();
      else heading.current?.focus();
    }
  }, [album, active]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!password.trim()) {
      setError('Enter our little key first ><');
      passwordInput.current?.focus();
      return;
    }
    if (!window.crypto?.subtle) {
      setError('Please open this page in a browser using HTTPS or localhost.');
      return;
    }
    setBusy(true);
    setError('');
    let encrypted: EncryptedAlbum;
    try {
      const response = await fetch('/ely/memories.enc.json', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unavailable');
      encrypted = await response.json();
      if (encrypted.version !== 1) throw new Error('Unsupported album');
    } catch {
      setError('Our little corner couldn’t load. Please try again.');
      setBusy(false);
      return;
    }
    try {
      const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password.trim()),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: bytes(encrypted.salt),
          iterations: encrypted.iterations,
          hash: 'SHA-256',
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(encrypted.iv) },
        key,
        bytes(encrypted.ciphertext)
      );
      const content: Album = JSON.parse(new TextDecoder().decode(plaintext));
      setPassword('');
      setShowPassword(false);
      setEntering(true);
      unlockTimer.current = setTimeout(
        () => {
          setAlbum(content);
          setEntering(false);
          setBusy(false);
        },
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650
      );
    } catch {
      setError('Hmm, try our little key again ><');
      setBusy(false);
      passwordInput.current?.focus();
      passwordInput.current?.select();
    }
  }

  function lock() {
    setActive(null);
    setAlbum(null);
    setPassword('');
    setShowPassword(false);
    setError('');
    returnFocus.current = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <main className={styles.corner}>
      {active ? (
        <section className={styles.reader} aria-label={active.title}>
          <div className={styles.readerBar}>
            <button autoFocus onClick={() => setActive(null)}>
              <SmallIcon name="back" />
              <span>Our little corner</span>
            </button>
            <span className={styles.readerTitle}>{active.title}</span>
            <button onClick={lock} aria-label="Lock our corner">
              <SmallIcon name="lock" />
            </button>
          </div>
          <iframe
            key={active.id}
            title={active.title}
            srcDoc={active.html}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className={styles.memoryFrame}
          />
        </section>
      ) : (
        <div className={styles.shell}>
          <header className={styles.header}>
            <span className={styles.wordmark}>
              <span aria-hidden="true">✳</span> our little corner
            </span>
            {album ? (
              <button className={styles.lock} onClick={lock}>
                <SmallIcon name="lock" />
                <span>Close for now</span>
              </button>
            ) : (
              <span className={styles.headerNote}>
                a little place, made with care
              </span>
            )}
          </header>
          {!album ? (
            <section className={styles.gate} aria-labelledby="welcome-title">
              <div className={styles.gatePicture}>
                <span className={styles.pictureNote}>
                  there’s a light on for you
                </span>
                <Door open={entering} pets />
                <span className={styles.pictureCaption}>come as you are.</span>
              </div>
              <div className={styles.welcome}>
                <p className={styles.eyebrow}>JUST A LITTLE SPACE FOR US</p>
                <h1 id="welcome-title">
                  Our little
                  <br />
                  <em>corner.</em>
                  <span className={styles.titleStar} aria-hidden="true">
                    ✧
                  </span>
                </h1>
                <p className={styles.welcomeText}>
                  Hiiii Ely &gt;&lt;
                  <br />A few things I made for you,
                  <br />
                  all tucked away in one cozy place.
                </p>
                <form className={styles.form} onSubmit={unlock} noValidate>
                  <label htmlFor="little-key">Our little key</label>
                  <div
                    className={`${styles.inputWrap} ${error ? styles.inputError : ''}`}
                  >
                    <SmallIcon name="key" />
                    <input
                      ref={passwordInput}
                      id="little-key"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                      }}
                      placeholder="The key to our corner"
                      autoComplete="current-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      aria-invalid={!!error}
                      aria-describedby="key-message"
                      disabled={busy}
                    />
                    <button
                      className={styles.showPassword}
                      type="button"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={busy}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    className={styles.enterButton}
                    type="submit"
                    disabled={busy}
                  >
                    {entering
                      ? 'Welcome in, Ely'
                      : busy
                        ? 'Opening our little door…'
                        : 'Come in'}
                    <SmallIcon name="arrow" />
                  </button>
                  <p
                    id="key-message"
                    className={`${styles.formNote} ${error ? styles.errorNote : ''}`}
                    aria-live="polite"
                  >
                    {error || 'Just for us. Take your time.'}
                  </p>
                </form>
              </div>
            </section>
          ) : (
            <div className={styles.album}>
              <section className={styles.albumIntro}>
                <div>
                  <p className={styles.eyebrow}>FOR ELY, WITH CARE</p>
                  <h1 ref={heading} tabIndex={-1}>
                    Little things,
                    <br />
                    <em>kept for you.</em>
                  </h1>
                  <p>
                    A letter, a little light, a bit of courage.
                    <br />
                    You can come back to them whenever you like.
                  </p>
                </div>
                <div className={styles.homeVignette}>
                  <Door open pets />
                  <span>you’re always welcome here.</span>
                </div>
              </section>
              <div className={styles.timelineHeading}>
                <span>OUR LITTLE COLLECTION</span>
                <span>
                  2026 <span aria-hidden="true">↘</span>
                </span>
              </div>
              <ol className={styles.timeline}>
                {album.memories.map((memory, index) => (
                  <li key={memory.id} className={styles.timelineRow}>
                    <div className={styles.date}>
                      <span className={styles.dot} />
                      <time dateTime={memory.date}>
                        {new Intl.DateTimeFormat('en', {
                          month: 'short',
                          day: '2-digit',
                          timeZone: 'UTC',
                        }).format(new Date(`${memory.date}T12:00:00Z`))}
                      </time>
                      <span>2026</span>
                    </div>
                    <button
                      id={`memory-${memory.id}`}
                      className={styles.memoryCard}
                      onClick={() => {
                        returnFocus.current = `memory-${memory.id}`;
                        setActive(memory);
                      }}
                    >
                      <div
                        className={`${styles.memoryArt} ${styles[memory.kind]}`}
                      >
                        <MemoryArt kind={memory.kind} />
                      </div>
                      <div className={styles.memoryCopy}>
                        <span className={styles.memoryLabel}>
                          {memory.label}
                        </span>
                        <h2>{memory.title}</h2>
                        <p>{memory.description}</p>
                        <span className={styles.openMemory}>
                          Open this memory <SmallIcon name="arrow" />
                        </span>
                      </div>
                      <span className={styles.memoryNumber}>0{index + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className={styles.more}>
                <svg
                  className={styles.petFamily}
                  viewBox="0 0 265 85"
                  fill="none"
                  aria-hidden="true"
                >
                  <ellipse cx="130" cy="74" rx="120" ry="5" fill="#e9dcd4" />
                  <LittleCat
                    x={8}
                    y={17}
                    scale={0.85}
                    coat="#d5aa82"
                    patch="#b58362"
                  />
                  <LittleCat
                    x={66}
                    y={27}
                    scale={0.7}
                    coat="#f8eee1"
                    patch="#b0a39b"
                  />
                  <LittleCat x={119} y={14} scale={0.9} coat="#a59b97" />
                  <LittleDog x={191} y={15} scale={0.9} />
                </svg>
                <p>
                  More little things,
                  <br />
                  <em>whenever they come.</em>
                </p>
                <span className={styles.moreDots} aria-hidden="true">
                  · · ·
                </span>
              </div>
            </div>
          )}
          <footer className={styles.footer}>
            <span>made with a warm heart</span>
            <span>
              Yongjin <span className={styles.heart}>♡</span> Ely
            </span>
          </footer>
        </div>
      )}
    </main>
  );
}
