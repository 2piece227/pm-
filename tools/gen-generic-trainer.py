"""
범용 트레이너 도트 — public/assets/trainers/generic.png (80×80, 원작 트레이너 스프라이트와 같은 판형)
FM 기본 얼굴처럼 얼굴이 없는 실루엣.

네임드가 아닌 트레이너(생성 유스·NPC 소속사 선수·생성 사천왕/챔피언)는 FM의 기본 얼굴처럼
이 한 장을 같이 쓴다. 외부 의존성 없이 순수 파이썬으로 PNG를 쓴다.
실행: python tools/gen-generic-trainer.py
"""
import os, struct, zlib

W = H = 80
px = [[None] * W for _ in range(H)]

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
C = {k: hexc(v) for k, v in {
    'body': '#17191f', 'shade': '#0f1014', 'trim': '#e8eaee', 'trim2': '#9aa0aa', 'rim': '#3a3f4a',
}.items()}
OUT = hexc('#8d939e')

def put(x, y, c):
    if 0 <= x < W and 0 <= y < H: px[y][x] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, c)
def ellipse(cx, cy, rx, ry, c, y_min=-1, y_max=999):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1 and y_min <= y <= y_max: put(x, y, c)
def trap(y0, y1, l0, r0, l1, r1, c):
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        rect(round(l0 + (l1 - l0) * t), y, round(r0 + (r1 - r0) * t), y, c)

cx = 40
B = C['body']
# FM 기본 얼굴처럼 얼굴 없는 실루엣 — 머리·목·어깨·저지, 전신
ellipse(cx, 17, 8, 10, B)                 # 머리
ellipse(cx, 10, 8, 4, B)                  # 머리 윗선(머리카락 볼륨)
rect(36, 26, 44, 31, B)                   # 목
trap(30, 36, 33, 47, 24, 56, B)           # 어깨 경사
trap(36, 56, 24, 56, 27, 53, B)           # 몸통(저지)
trap(34, 54, 20, 25, 18, 24, B); trap(34, 54, 55, 60, 56, 62, B)   # 팔
ellipse(21, 56, 3, 3, B); ellipse(59, 56, 3, 3, B)                 # 손
rect(29, 56, 38, 72, B); rect(42, 56, 51, 72, B)                   # 다리
rect(27, 73, 38, 75, B); rect(42, 73, 53, 75, B)                   # 신발
# 저지 트림: V넥 흰 선 + 어깨 줄무늬 (FM 기본 사진의 유니폼 느낌)
for i in range(7):
    put(34 + i, 30 + i, C['trim']); put(46 - i, 30 + i, C['trim'])
for sx, d in ((27, 1), (53, -1)):
    for k in range(3):
        for j in range(3): put(sx + d * (k * 3 + j), 33 + k - (j == 1), C['trim2'])
# 은은한 테두리 빛 (왼쪽 위에서)
for y in range(H):
    for x in range(W):
        if px[y][x] == B and (x == 0 or px[y][x - 1] is None or (y > 0 and px[y - 1][x] is None)): px[y][x] = C['rim']

# 외곽선: 채워진 칸에 닿은 빈 칸
filled = [[c is not None for c in row] for row in px]
for y in range(H):
    for x in range(W):
        if filled[y][x]: continue
        if any(0 <= x + dx < W and 0 <= y + dy < H and filled[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[y][x] = OUT[:3] + (150,)
raw = b''.join(b'\x00' + b''.join(bytes(c if c else (0, 0, 0, 0)) for c in row) for row in px)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'trainers', 'generic.png')
open(out, 'wb').write(png)
print('wrote', os.path.normpath(out), len(png), 'bytes')
