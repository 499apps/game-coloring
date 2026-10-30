/**
 * The pictures to color (pure data). Original line art drawn in code for this project: a
 * friendly dinosaur, a rocket, a fish, a castle, a cat, a flower garden, a race car, a robot
 * and a butterfly. Shapes are listed back to front in a 1000 x 1000 unit space.
 */
import {
  arch,
  circle,
  cloud,
  curve,
  ellipse,
  flower,
  ground,
  heart,
  line,
  mirrorX,
  poly,
  rect,
  shape,
  star,
  type Shape,
} from './shapes';

export interface SceneDef {
  id: string;
  /** Accessible name (the picker itself shows only pictures). */
  label: string;
  shapes: Shape[];
}

function sunRays(cx: number, cy: number, r0: number, r1: number, n = 8): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    out.push(
      line([
        [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
        [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
      ]),
    );
  }
  return out;
}

function grass(x: number, y: number): Shape {
  return line([
    [x - 14, y - 4],
    [x - 6, y + 16],
    [x, y - 10],
    [x + 6, y + 16],
    [x + 14, y - 4],
  ]);
}

const dino: SceneDef = {
  id: 'dino',
  label: 'Friendly dinosaur',
  shapes: [
    circle(860, 150, 70),
    ...sunRays(860, 150, 92, 130),
    cloud(230, 170, 1),
    shape([['M', 560, 790], ['Q', 780, 470, 1020, 600], ['L', 1020, 800], ['Z']]),
    ground(770, 18, 2),
    // Tail, back legs and back spikes sit behind the body.
    shape([['M', 290, 560], ['Q', 150, 600, 70, 500], ['Q', 120, 650, 300, 645], ['Z']]),
    rect(300, 640, 72, 150, 30),
    rect(560, 640, 72, 150, 30),
    poly([[298, 520], [330, 425], [362, 520]]),
    poly([[378, 500], [410, 400], [442, 500]]),
    poly([[458, 500], [490, 400], [522, 500]]),
    shape([['M', 560, 520], ['C', 600, 420, 610, 330, 650, 262], ['L', 740, 280], ['C', 690, 350, 680, 440, 660, 560], ['Z']]),
    ellipse(470, 590, 220, 140),
    ellipse(500, 635, 125, 55),
    circle(400, 530, 26),
    circle(485, 505, 20),
    circle(580, 535, 17),
    rect(380, 655, 74, 140, 30),
    rect(640, 655, 74, 140, 30),
    ellipse(705, 245, 95, 70),
    circle(735, 225, 17),
    circle(740, 226, 7),
    curve(735, 275, 768, 292, 792, 262),
    circle(668, 268, 13),
    grass(120, 850),
    grass(860, 880),
    grass(250, 930),
  ],
};

const rocket: SceneDef = {
  id: 'rocket',
  label: 'Rocket in space',
  shapes: [
    ellipse(500, 1130, 720, 270),
    star(820, 160, 38),
    star(880, 430, 26),
    star(120, 520, 30),
    star(780, 660, 34),
    star(150, 800, 24),
    star(880, 810, 40),
    ellipse(170, 215, 150, 32),
    circle(170, 205, 85),
    curve(22, 215, 170, 275, 318, 215),
    circle(130, 175, 16),
    circle(205, 240, 11),
    // Flames, then fins behind the body.
    shape([['M', 448, 600], ['Q', 430, 700, 500, 820], ['Q', 570, 700, 552, 600], ['Z']]),
    shape([['M', 472, 600], ['Q', 465, 690, 500, 755], ['Q', 535, 690, 528, 600], ['Z']]),
    shape([['M', 410, 420], ['Q', 320, 500, 315, 625], ['L', 412, 560], ['Z']]),
    mirrorX(shape([['M', 410, 420], ['Q', 320, 500, 315, 625], ['L', 412, 560], ['Z']])),
    shape([['M', 500, 140], ['C', 590, 220, 612, 330, 600, 565], ['L', 400, 565], ['C', 388, 330, 410, 220, 500, 140], ['Z']]),
    shape([['M', 500, 140], ['C', 545, 180, 568, 215, 582, 255], ['L', 418, 255], ['C', 432, 215, 455, 180, 500, 140], ['Z']]),
    poly([[418, 565], [582, 565], [565, 612], [435, 612]]),
    circle(500, 360, 58),
    circle(500, 360, 38),
    rect(486, 470, 28, 150, 12),
    circle(445, 440, 10),
    circle(555, 440, 10),
  ],
};

const fishTail = shape([['M', 290, 480], ['L', 130, 350], ['Q', 175, 480, 130, 610], ['Z']]);

const fish: SceneDef = {
  id: 'fish',
  label: 'Fish under the sea',
  shapes: [
    shape([
      ['M', -20, 120],
      ['Q', 100, 70, 220, 120],
      ['Q', 340, 170, 460, 120],
      ['Q', 580, 70, 700, 120],
      ['Q', 820, 170, 940, 120],
      ['Q', 1000, 95, 1040, 110],
      ['L', 1040, -40],
      ['L', -20, -40],
      ['Z'],
    ]),
    ellipse(780, 860, 125, 70),
    shape([['M', 110, 880], ['C', 70, 780, 150, 720, 105, 620], ['C', 90, 580, 115, 545, 140, 520], ['C', 170, 580, 150, 640, 172, 690], ['C', 200, 770, 150, 800, 172, 880], ['Z']]),
    shape([['M', 880, 880], ['C', 840, 790, 910, 730, 870, 650], ['C', 860, 610, 880, 585, 900, 570], ['C', 930, 625, 915, 680, 935, 720], ['C', 960, 790, 920, 820, 940, 880], ['Z']]),
    ground(870, 16, 2),
    star(320, 905, 46, 5, 0.5),
    ellipse(560, 925, 40, 26),
    // The big fish: tail and fins first, then the body and its stripes.
    fishTail,
    shape([['M', 380, 352], ['Q', 470, 225, 590, 362], ['Z']]),
    shape([['M', 430, 615], ['Q', 470, 705, 540, 612], ['Z']]),
    ellipse(480, 480, 230, 150),
    curve(400, 340, 368, 480, 400, 620),
    curve(520, 333, 488, 480, 520, 627),
    curve(600, 353, 640, 480, 600, 607),
    circle(652, 440, 30),
    circle(660, 440, 13),
    curve(672, 518, 696, 534, 714, 505),
    // A small fish and some bubbles.
    poly([[850, 262], [915, 222], [915, 302]]),
    ellipse(800, 262, 72, 42),
    circle(770, 252, 9),
    circle(650, 255, 22),
    circle(690, 200, 15),
    circle(640, 175, 11),
    circle(240, 250, 18),
  ],
};

const castle: SceneDef = {
  id: 'castle',
  label: 'Castle on a hill',
  shapes: [
    circle(130, 140, 62),
    ...sunRays(130, 140, 80, 112),
    cloud(770, 150, 0.9),
    ground(780, 20, 2),
    // Middle tower behind the wall.
    rect(420, 260, 160, 210),
    poly([[400, 272], [500, 120], [600, 272]]),
    circle(500, 335, 30),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => rect(260 + i * (440 / 6), 392, 40, 60, 4)),
    rect(260, 430, 480, 365),
    rect(300, 700, 56, 28, 8),
    rect(640, 650, 56, 28, 8),
    rect(330, 470, 50, 28, 8),
    rect(170, 330, 140, 465),
    rect(690, 330, 140, 465),
    poly([[150, 345], [240, 172], [330, 345]]),
    poly([[670, 345], [760, 172], [850, 345]]),
    line([[240, 172], [240, 100]]),
    poly([[240, 100], [305, 118], [240, 136]]),
    line([[760, 172], [760, 100]]),
    poly([[760, 100], [825, 118], [760, 136]]),
    arch(240, 520, 54, 92),
    arch(760, 520, 54, 92),
    arch(370, 610, 50, 80),
    arch(630, 610, 50, 80),
    arch(500, 795, 124, 200),
    line([[500, 655], [500, 795]]),
    shape([['M', 440, 795], ['Q', 420, 900, 350, 1040], ['L', 650, 1040], ['Q', 580, 900, 560, 795], ['Z']]),
    rect(70, 700, 34, 110, 10),
    circle(87, 660, 62),
    rect(898, 700, 34, 110, 10),
    circle(915, 660, 62),
  ],
};

const cat: SceneDef = {
  id: 'cat',
  label: 'Cat with a ball of yarn',
  shapes: [
    rect(640, 120, 260, 220, 16),
    line([[770, 120], [770, 340]]),
    line([[640, 230], [900, 230]]),
    rect(-20, 800, 1040, 260),
    ellipse(480, 905, 420, 90),
    // Yarn ball and its thread.
    curve(742, 796, 650, 862, 560, 840),
    circle(800, 760, 80),
    curve(735, 715, 800, 772, 862, 705),
    curve(728, 790, 800, 740, 874, 795),
    // Tail behind the body.
    shape([['M', 580, 700], ['C', 720, 720, 740, 560, 660, 520], ['C', 640, 510, 618, 530, 640, 548], ['C', 690, 585, 690, 680, 570, 660], ['Z']]),
    ellipse(430, 640, 190, 170),
    ellipse(430, 690, 100, 95),
    ellipse(365, 795, 58, 30),
    ellipse(495, 795, 58, 30),
    // Ears, then the head.
    poly([[318, 335], [325, 195], [425, 280]]),
    poly([[542, 335], [535, 195], [435, 280]]),
    poly([[338, 312], [342, 235], [396, 283]]),
    poly([[522, 312], [518, 235], [464, 283]]),
    circle(430, 400, 140),
    shape([['M', 322, 515], ['Q', 430, 572, 538, 515], ['L', 545, 545], ['Q', 430, 605, 315, 545], ['Z']]),
    circle(430, 585, 20),
    ellipse(380, 390, 26, 34),
    ellipse(480, 390, 26, 34),
    ellipse(384, 397, 10, 18),
    ellipse(484, 397, 10, 18),
    poly([[414, 445], [446, 445], [430, 463]]),
    curve(430, 463, 430, 486, 405, 490),
    curve(430, 463, 430, 486, 455, 490),
    line([[360, 452], [280, 436]]),
    line([[362, 468], [280, 478]]),
    line([[500, 452], [580, 436]]),
    line([[498, 468], [580, 478]]),
  ],
};

const garden: SceneDef = {
  id: 'garden',
  label: 'Flower garden',
  shapes: [
    circle(860, 140, 66),
    ...sunRays(860, 140, 86, 120),
    cloud(250, 150, 1),
    rect(-20, 600, 1040, 26),
    rect(-20, 680, 1040, 26),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) =>
      poly([
        [i * 70 - 10, 760],
        [i * 70 - 10, 590],
        [i * 70 + 15, 560],
        [i * 70 + 40, 590],
        [i * 70 + 40, 760],
      ]),
    ),
    ground(740, 18, 2),
    ...flower(230, 470, 6, 62, 26, 830),
    ...flower(520, 390, 8, 72, 24, 850),
    ...flower(790, 490, 5, 58, 30, 830),
    heart(370, 900, 34),
    star(660, 910, 32),
    grass(110, 880),
    grass(900, 900),
  ],
};

const raceCar: SceneDef = {
  id: 'racecar',
  label: 'Race car',
  shapes: [
    cloud(220, 150, 0.9),
    cloud(760, 210, 0.75),
    circle(520, 120, 52),
    ellipse(250, 740, 330, 170),
    ellipse(790, 750, 360, 200),
    rect(-20, 700, 1040, 340),
    ...[0, 1, 2, 3, 4, 5].map((i) => rect(20 + i * 180, 862, 100, 18, 8)),
    // Spoiler behind the body.
    poly([[168, 560], [150, 455], [250, 455], [246, 480], [208, 488], [208, 560]]),
    shape([
      ['M', 140, 650],
      ['L', 150, 565],
      ['Q', 160, 520, 220, 512],
      ['L', 360, 502],
      ['Q', 420, 420, 520, 410],
      ['L', 640, 410],
      ['Q', 720, 415, 760, 502],
      ['L', 860, 520],
      ['Q', 902, 530, 902, 585],
      ['L', 896, 650],
      ['Z'],
    ]),
    shape([['M', 400, 502], ['Q', 440, 448, 520, 442], ['L', 598, 442], ['L', 606, 502], ['Z']]),
    shape([['M', 628, 442], ['L', 660, 442], ['Q', 708, 452, 734, 502], ['L', 638, 502], ['Z']]),
    rect(160, 590, 726, 22, 8),
    circle(470, 552, 30),
    ellipse(872, 556, 18, 12),
    circle(274, 652, 74),
    circle(274, 652, 34),
    circle(740, 652, 74),
    circle(740, 652, 34),
    circle(70, 600, 26),
    circle(40, 560, 17),
    line([[20, 660], [110, 660]]),
    line([[40, 700], [150, 700]]),
  ],
};

const robot: SceneDef = {
  id: 'robot',
  label: 'Happy robot',
  shapes: [
    star(140, 160, 40),
    star(860, 220, 32),
    star(110, 520, 26),
    star(900, 560, 36),
    rect(-20, 830, 1040, 230),
    line([[500, 175], [500, 112]]),
    circle(500, 95, 24),
    // Legs, arms and neck behind the body.
    rect(380, 650, 80, 160, 24),
    rect(540, 650, 80, 160, 24),
    rect(250, 410, 100, 190, 40),
    rect(650, 410, 100, 190, 40),
    rect(462, 360, 76, 40, 8),
    rect(330, 390, 340, 280, 46),
    rect(400, 440, 200, 150, 24),
    circle(440, 480, 16),
    circle(500, 480, 16),
    circle(560, 480, 16),
    heart(500, 545, 30),
    circle(290, 630, 42),
    circle(710, 630, 42),
    rect(352, 785, 136, 50, 25),
    rect(512, 785, 136, 50, 25),
    rect(335, 230, 40, 80, 14),
    rect(625, 230, 40, 80, 14),
    rect(370, 170, 260, 200, 40),
    circle(450, 260, 36),
    circle(550, 260, 36),
    circle(450, 262, 14),
    circle(550, 262, 14),
    rect(430, 312, 140, 34, 14),
    line([[465, 312], [465, 346]]),
    line([[500, 312], [500, 346]]),
    line([[535, 312], [535, 346]]),
    circle(395, 195, 8),
    circle(605, 195, 8),
  ],
};

const upperWing = shape([['M', 500, 420], ['C', 380, 200, 120, 180, 160, 360], ['C', 180, 460, 360, 480, 500, 452], ['Z']]);
const lowerWing = shape([['M', 500, 470], ['C', 360, 470, 220, 560, 280, 680], ['C', 340, 760, 460, 640, 500, 520], ['Z']]);

const butterfly: SceneDef = {
  id: 'butterfly',
  label: 'Butterfly',
  shapes: [
    cloud(160, 120, 0.8),
    cloud(840, 110, 0.7),
    ground(880, 16, 2),
    ...flower(170, 800, 5, 44, 20, 960),
    ...flower(830, 790, 6, 46, 18, 960),
    upperWing,
    mirrorX(upperWing),
    lowerWing,
    mirrorX(lowerWing),
    circle(300, 330, 56),
    circle(300, 330, 26),
    circle(700, 330, 56),
    circle(700, 330, 26),
    circle(375, 600, 40),
    circle(625, 600, 40),
    circle(225, 400, 18),
    circle(775, 400, 18),
    ellipse(500, 500, 34, 160),
    curve(468, 450, 500, 464, 532, 450),
    curve(466, 500, 500, 514, 534, 500),
    curve(468, 550, 500, 564, 532, 550),
    curve(485, 290, 450, 200, 412, 180),
    curve(515, 290, 550, 200, 588, 180),
    circle(405, 178, 15),
    circle(595, 178, 15),
    circle(500, 322, 46),
    circle(484, 316, 8),
    circle(516, 316, 8),
    curve(484, 340, 500, 352, 516, 340),
  ],
};

export const SCENES: readonly SceneDef[] = [dino, rocket, fish, castle, cat, garden, raceCar, robot, butterfly];

export const DEFAULT_SCENE_ID = SCENES[0]?.id ?? 'dino';

export function sceneById(id: string | null | undefined): SceneDef | undefined {
  return SCENES.find((s) => s.id === id);
}

export function sceneIndex(id: string): number {
  return SCENES.findIndex((s) => s.id === id);
}
