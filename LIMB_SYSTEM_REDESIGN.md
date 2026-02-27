# Limb Damage System — Повний Редизайн Архітектури

**Версія**: 1.0
**Статус**: Чекає підтвердження
**Автор**: Архітектурний документ для Shattered Dreams

---

## ЗМІСТ

1. [Обгрунтування міграції](#1-обгрунтування-міграції)
2. [Модель даних](#2-модель-даних)
3. [Модель пошкоджень](#3-модель-пошкоджень)
4. [HP кінцівок та регенерація](#4-hp-кінцівок-та-регенерація)
5. [Статуси кінцівок](#5-статуси-кінцівок)
6. [Перевизначення Crippled](#6-перевизначення-crippled)
7. [Підтримка багатьох акторів](#7-підтримка-багатьох-акторів)
8. [Система частин тіла ворогів](#8-система-частин-тіла-ворогів)
9. [Потік подій (Event Flow)](#9-потік-подій)
10. [План міграції](#10-план-міграції)
11. [Аналіз крайніх випадків](#11-аналіз-крайніх-випадків)
12. [Продуктивність](#12-продуктивність)
13. [Зміни в базі даних](#13-зміни-в-базі-даних)
14. [План реалізації плагіна](#14-план-реалізації-плагіна)

---

## 1. ОБГРУНТУВАННЯ МІГРАЦІЇ

### Чому змінних 1-7 недостатньо

Поточна система використовує 4 змінні (Vars 1-4) для HP кінцівок **одного** актора. Для підтримки 3+ акторів потрібно:
- 4 кінцівки × 3 актори = 12 змінних тільки для HP
- + Max HP, статуси кінцівок, таймери інфекції = 40+ змінних
- Змінні RPG Maker не підтримують вкладені структури

### Рішення: Гібридна архітектура

**Змінні 1-7 залишаються зарезервованими** (D-002 дотримано). Вони стають **дзеркалами** (mirrors) — читаються плагіном для сумісності зі старими troop events під час міграції, але нові дані зберігаються в об'єкті плагіна.

**Новий плагін**: `SD_LimbSystem.js` — єдиний файл, ES5, без залежностей.

### Стратегія збереження обмежень

| Обмеження | Дотримання |
|-----------|------------|
| Variables 1-7 зарезервовані | Так — дзеркальна синхронізація для першого активного актора |
| Switch 1 зарезервований | Так — не використовується плагіном |
| Common Events 1-2 | Замінюються плагіном, але залишаються в БД для довідки |
| State 11 = Crippled | Так — залишається як маркер, плагін керує нанесенням |
| Front-view DTB | Так — жодних змін |
| RuneSkills.js | Не чіпаємо |
| plugins.js | Додаємо лише SD_LimbSystem.js |

---

## 2. МОДЕЛЬ ДАНИХ

### 2.1 Основна структура (per-actor)

Зберігається в `$gameSystem._limbData[actorId]`:

```
{
  actorId: 5,
  limbs: {
    leftArm:  { hp: 100, maxHp: 100, statuses: {}, crippled: false },
    rightArm: { hp: 100, maxHp: 100, statuses: {}, crippled: false },
    leftLeg:  { hp: 100, maxHp: 100, statuses: {}, crippled: false },
    rightLeg: { hp: 100, maxHp: 100, statuses: {}, crippled: false }
  },
  initialized: true
}
```

### 2.2 Структура статусу кінцівки

```
statuses: {
  infected:  { active: false, timer: 0, maxTimer: 10 },
  bloodLoss: { active: false, stacks: 0 },
  maimed:    { active: false, maxHpReduction: 0 },
  malformed: { active: false, hpMod: 0, atkMod: 0 }
}
```

### 2.3 Дзеркальна синхронізація змінних

Після кожної зміни limb даних для **поточного лідера партії**:
```
$gameVariables.setValue(1, limbData.limbs.leftArm.hp);
$gameVariables.setValue(2, limbData.limbs.rightArm.hp);
$gameVariables.setValue(3, limbData.limbs.leftLeg.hp);
$gameVariables.setValue(4, limbData.limbs.rightLeg.hp);
// Var 5 — кількість неушкоджених кінцівок
// Var 6, 7 — залишаються для тимчасових обчислень
```

### 2.4 Збереження / Завантаження

`$gameSystem._limbData` автоматично серіалізується через стандартний MV save mechanism (бо `$gameSystem` зберігається автоматично). Жодних хуків DataManager не потрібно.

### 2.5 Змінні та Свічі (повна карта)

**Змінні (без змін у призначенні):**

| ID | Назва | Нова роль |
|----|-------|-----------|
| 1 | Left Arm HP | Дзеркало: HP лівої руки лідера партії |
| 2 | Right Arm HP | Дзеркало: HP правої руки лідера партії |
| 3 | Left Leg HP | Дзеркало: HP лівої ноги лідера партії |
| 4 | Right Leg HP | Дзеркало: HP правої ноги лідера партії |
| 5 | Limb HP Counter | Дзеркало: кількість функціональних кінцівок |
| 6 | Damage Amount | Тимчасова: останній обсяг пошкодження кінцівки |
| 7 | Target Limb | Тимчасова: остання ціль (1-4) |
| 8 | AppleCount | Без змін |
| 9 | MonsterCount | Без змін |

**Свічі (без змін):**

| ID | Назва | Роль |
|----|-------|------|
| 1 | Limb HP Initialized | Legacy gate — плагін ігнорує, але не перезаписує |

---

## 3. МОДЕЛЬ ПОШКОДЖЕНЬ

### 3.1 Основний принцип

Кожна ворожа атака завдає:
1. **Звичайне пошкодження HP актора** (стандартний MV flow, без змін)
2. **Пошкодження обраної кінцівки** (новий шар, прихований від гравця)

### 3.2 Визначення цільової кінцівки

Визначається **типом атаки ворога** через notetag на skill ворога:

```
<limbTarget: random>        — випадкова кінцівка (за замовчуванням)
<limbTarget: arms>          — випадково ліва або права рука
<limbTarget: legs>          — випадково ліва або права нога
<limbTarget: leftArm>       — конкретна кінцівка
<limbTarget: weakest>       — кінцівка з найнижчим HP
<limbTarget: none>          — ця атака не б'є по кінцівках (магія, отрута)
```

Якщо notetag відсутній → `random` за замовчуванням.

### 3.3 Формула пошкодження кінцівки

```
limbDamage = Math.floor(hpDamage * limbDamageRatio)
```

Де `limbDamageRatio` конфігурується в плагіні (за замовчуванням `0.35`).

**Обгрунтування**: якщо ворог вдарив на 100 HP, кінцівка отримує ~35 одиниць пошкодження. Це означає, що кінцівку (100 HP) можна знищити за ~3 сильних удари в одне місце, що створює тактичну загрозу.

Модифікатори:
- Якщо кінцівка вже `maimed` → limbDamage × 1.5
- Якщо атака критична → limbDamage × 2.0
- Якщо target defender має високу DEF → без впливу на limb damage (броня не захищає кінцівки ідеально — dark fantasy)

### 3.4 Точка інтеграції (Hook)

Хук у `Game_Action.prototype.executeHpDamage`:

```
// Псевдокод (ES5)
var _orig_executeHpDamage = Game_Action.prototype.executeHpDamage;
Game_Action.prototype.executeHpDamage = function(target, value) {
    _orig_executeHpDamage.call(this, target, value);
    if (target.isActor() && value > 0) {
        SDLimb.applyLimbDamage(target, this.item(), value);
    }
};
```

Це гарантує:
- HP актора змінюється стандартно (YEP_BattleEngineCore сумісність)
- Limb damage додається **після** HP damage
- Працює для будь-якого актора автоматично
- Не залежить від troop events

### 3.5 Текстовий зворотний зв'язок гравцю

Замість числових значень — **наративні повідомлення** в Battle Log:

| Поріг HP кінцівки | Повідомлення |
|-------------------|-------------|
| 75-99% | *(нічого)* |
| 50-74% | "Ваша [ліва рука] болить від удару." |
| 25-49% | "Ваша [ліва рука] серйозно поранена!" |
| 1-24% | "Ваша [ліва рука] на межі руйнування!" |
| 0% | "Ваша [ліва рука] ЗНИЩЕНА!" |

Повідомлення показуються **тільки при перетині порогу** (не кожен удар).

---

## 4. HP КІНЦІВОК ТА РЕГЕНЕРАЦІЯ

### 4.1 Базові параметри

| Параметр | Значення | Логіка |
|----------|----------|--------|
| Limb Max HP | 100 | Однакове для всіх кінцівок і акторів (v1.0) |
| Destroyed threshold | 0 | При HP <= 0 — кінцівка знищена |
| Crippled trigger | HP === 0 | Негайне нанесення Crippled на цю кінцівку |

### 4.2 Регенерація

**Правило**: регенерація працює **тільки поза боєм** (на карті).

**Логіка**:
- Кожні **50 кроків на карті** → кожна незнищена кінцівка отримує +1 HP
- Максимальна регенерація обмежена `maxHp` цієї кінцівки
- Якщо кінцівка `crippled` → **регенерація не працює** (знищена назавжди)
- Якщо кінцівка має статус `infected` → регенерація **заблокована** для цієї кінцівки
- Якщо кінцівка має статус `bloodLoss` → регенерація **сповільнена** (1 HP на 100 кроків)

**Обгрунтування**: тіло відновлюється повільно між боями. В бою адреналін не дозволяє загоюватися. Знищена кінцівка — це перманентна втрата, рана що не закриється сама.

### 4.3 Пороги стану

```
100-76 HP → Здорова (Healthy)
 75-51 HP → Поранена (Wounded)
 50-26 HP → Серйозно поранена (Severely Wounded)
 25-1  HP → Критична (Critical)
    0  HP → Знищена (Destroyed → Crippled)
```

### 4.4 Регенерація не відновлює знищене

Якщо кінцівка досягла 0 → `crippled = true`. Ця позначка **ніколи не скидається** регенерацією. Тільки майбутній спеціальний механізм (Divine Healing, Prosthetics, etc.) зможе відновити кінцівку. Для цього в коді передбачається метод `SDLimb.restoreLimb(actorId, limbKey)`, але він не викликається ніде в v1.0.

---

## 5. СТАТУСИ КІНЦІВОК

### 5.1 Infected (Інфікована)

**Тригер**: автоматичний шанс при пошкодженні кінцівки.
- 10% шанс при будь-якому limb damage
- 25% шанс якщо кінцівка вже `maimed`
- 100% шанс при знищенні кінцівки (Crippled)

**Поведінка**:
- Таймер починається з 0, збільшується на +1 **кожен хід бою** та **кожні 100 кроків на карті**
- При timer >= 5 → застосовується State 4 (Poison) на актора як системний ефект (інфекція поширюється)
- При timer >= 10 → актор **гине** (HP → 0) незалежно від поточного HP. Показується повідомлення: "[Актор] помирає від зараження."

**Лікування**:
- Предмет "Пилка" (новий, Item ID визначити при реалізації) → дає Crippled, але скидає infected на конкретній кінцівці
- Предмет "Антисептик" (новий, Item ID визначити при реалізації) → скидає infected на конкретній кінцівці, але рідкісніший
- Skill лікування (наприклад, Lesser Healing через руни) → зменшує timer на 3

**Взаємодія з регенерацією**: блокує регенерацію повністю для цієї кінцівки.

**Стек**: НЕ стекається. Одна кінцівка може бути інфікована тільки один раз. Повторне зараження просто скидає таймер на 0.

### 5.2 Blood Loss (Кровотеча)

**Тригер**: шанс при пошкодженні кінцівки нижче 50% HP.
- 20% шанс при limb damage, якщо HP кінцівки < 50
- 40% шанс при limb damage, якщо HP кінцівки < 25
- 100% при знищенні кінцівки

**Поведінка**:
- **Стекається** (максимум 3 стеки)
- Кожен стек: -3% max HP актора **за хід** у бою
- Поза боєм: -1% max HP кожні 50 кроків за стек
- Не вбиває (мінімум 1 HP)

**Реалізація стеків**: stacks = 1/2/3. Кожен стек — це окрема рана що кровоточить. Нова рана = +1 стек.

**Лікування**:
- Предмет "Бинт" (новий) → знімає 1 стек
- Відпочинок (майбутній механізм) → знімає всі стеки
- Lesser Healing → знімає 1 стек

**Взаємодія з регенерацією**: сповільнює регенерацію вдвічі (1 HP / 100 кроків замість 50).

### 5.3 Maimed (Калічна)

**Тригер**: при будь-якому одиничному limb damage >= 30 одиниць.

**Поведінка**:
- Зменшує `maxHp` кінцівки на 20 (постійно до лікування)
- Кінцівка не може регенерувати вище нового maxHp
- Збільшує вхідний limb damage на ×1.5 (кінцівка вразливіша)
- Збільшує шанс інфекції до 25%

**Стек**: НЕ стекується, але ефект кумулятивний — кожне нове нанесення Maimed зменшує maxHp ще на 20. При maxHp <= 0 → кінцівка автоматично знищується.

**Лікування**: тільки спеціальний предмет "Шина" (новий) або магія (майбутній контент).

### 5.4 Malformed (Деформована)

**Тригер**: удар по кінцівці певними закляттями АБО шанс 1% при будь-якому limb damage.

**Поведінка** (випадковий модифікатор, визначається при нанесенні):
```
roll = Random(1, 4)
case 1: hpMod = +15, atkMod = -5   // Набряк: більше HP, менше сили
case 2: hpMod = -15, atkMod = +5   // Надлом: менше HP, нервові пошкодження підсилюють реакцію
case 3: hpMod = +10, atkMod = +3   // Мутація: рідкісний позитив
case 4: hpMod = -20, atkMod = -8   // Некроз: найгірший варіант
```

- `hpMod` додається до поточного HP кінцівки (може вбити її якщо HP + hpMod <= 0)
- `atkMod` додається/віднімається від ATK актора через тимчасовий buff/debuff

**Стек**: НЕ стекується. Нове нанесення **замінює** попереднє (тіло перебудовується).

**Лікування**: Не лікується предметами. Знімається тільки при повному лікуванні кінцівки до maxHp або спеціальною магією.

### 5.5 Зберігання статусів (не через MV States)

Статуси кінцівок **НЕ** є MV States (окрім Crippled = State 11). Вони зберігаються в об'єкті `_limbData` і обробляються плагіном.

**Причина**: MV States — глобальні для актора. Limb statuses — прив'язані до конкретної кінцівки. Одна рука може бути інфікована, а інша — ні. MV не підтримує per-slot states.

State 11 (Crippled) залишається MV State для візуального індикатора та глобальних штрафів.

---

## 6. ПЕРЕВИЗНАЧЕННЯ CRIPPLED

### 6.1 State 11 залишається єдиним MV State

State 11 (Crippled) **не** розбивається на кілька states (Crippled Left Arm, Crippled Right Leg...). Причина:

- MV state slots обмежені (14-20 вільні, але потрібні для інших систем)
- State 11 вже має потрібні traits (AGI -20, Hit 50%, DEF 65%)
- Один state для "тіло актора фізично зруйноване" — логічно достатньо

### 6.2 Нова поведінка Crippled

**Коли застосовується**: будь-яка кінцівка досягає 0 HP.

**Що змінюється порівняно з поточним**:

| Аспект | Було | Стало |
|--------|------|-------|
| Тригер | Counter <= 1 (3+ зламаних) | Будь-яка 1 кінцівка = 0 HP |
| Актор | Тільки Actor 5 | Будь-який актор у партії |
| Зняття | Якщо counter > 1 | Ніколи автоматично |
| Equipment | Без ефекту | Блокує слот кінцівки |

### 6.3 Обмеження екіпірування

При знищенні кінцівки:

| Знищена кінцівка | Заблокований equip slot |
|------------------|------------------------|
| Left Arm | Weapon (slot 0) — якщо двуручна зброя |
| Right Arm | Shield (slot 1) |
| Left Leg | Accessory (slot 4) — тематична прив'язка: наголінники |
| Right Leg | Accessory (slot 4) — аналогічно |

**Реалізація**: плагін перевизначає `Game_Actor.prototype.isEquipChangeOk(slotId)` і блокує відповідні слоти якщо відповідна кінцівка crippled.

Зброя при знищенні руки **автоматично знімається** (падає в інвентар).
При знищенні ноги зменшується базова швидкість.

### 6.4 Каскадні ефекти Crippled

При знищенні кінцівки:
1. `crippled = true` для цієї кінцівки
2. State 11 застосовується до актора (якщо ще не має)
3. 100% шанс Infected на цій кінцівці (відкрита рана)
4. 100% шанс Blood Loss (1 стек)
5. Обмеження екіпірування активується
6. Повідомлення в Battle Log: "Ліву руку [Актора] знищено!"

### 6.5 Множинна втрата кінцівок

State 11 не стекується (MV states не стекуються). Замість цього плагін відстежує **кількість знищених кінцівок** і масштабує ефекти:

| Знищених кінцівок | Додатковий ефект |
|-------------------|-----------------|
| 1 | State 11 traits (базові) |
| 2 | ATK × 0.7 (через плагін param modifier) |
| 3 | ATK × 0.5, AGI × 0.5 |
| 4 | Актор непритомніє (HP → 0, State 1 Knockout) |

---

## 7. ПІДТРИМКА БАГАТЬОХ АКТОРІВ

### 7.1 Динамічна ініціалізація

Limb data ініціалізується **лазиво** при першому доступі:

```
SDLimb.getData = function(actorId) {
    if (!$gameSystem._limbData) $gameSystem._limbData = {};
    if (!$gameSystem._limbData[actorId]) {
        $gameSystem._limbData[actorId] = SDLimb.createDefaultData(actorId);
    }
    return $gameSystem._limbData[actorId];
};
```

### 7.2 Підтримувані актори

- Actor 5 (Knight) — повна підтримка
- Actor 6 (Hunter) — повна підтримка
- Actor 7 (Priest) — повна підтримка
- Майбутні актори — автоматична підтримка (ліниве створення)

### 7.3 Визначення цілі в бою

Hook в `executeHpDamage` отримує `target` як параметр — це завжди конкретний `Game_Actor`. Система автоматично працює з будь-яким актором без hardcoded ID.

### 7.4 Дзеркальна синхронізація

Змінні 1-4 завжди відображають стан **лідера партії** (`$gameParty.leader()`). Це гарантує сумісність з будь-яким обраним класом (Knight/Hunter/Priest).

### 7.5 Партійна експансія (майбутнє)

Якщо партія розшириться до 2+ акторів одночасно:
- Кожен актор має свій `_limbData[actorId]`
- В бою кожен актор отримує limb damage окремо
- Змінні 1-4 — тільки лідер (обмеження дзеркала)
- Не потрібні додаткові змінні для інших учасників

---

## 8. СИСТЕМА ЧАСТИН ТІЛА ВОРОГІВ

### 8.1 Архітектура: Troop як тіло

Один "великий монстр" = один Troop з кількома Enemy записами, де кожен enemy — частина тіла:

```
Troop "Dragon" = {
  Enemy 1: "Dragon Head"     (mark as head via notetag)
  Enemy 2: "Dragon Left Claw"
  Enemy 3: "Dragon Right Claw"
  Enemy 4: "Dragon Tail"
}
```

### 8.2 Notetag на ворогах

В полі `note` ворога (Enemy database entry):

```
<bodyPart: head>     — голова, при смерті вбиває всю групу
<bodyPart: limb>     — кінцівка, при смерті послаблює решту
<bodyPart: body>     — тулуб, звичайна частина
<bodyPart: none>     — звичайний ворог (не частина тіла)
```

Якщо notetag відсутній → `none` (звичайний ворог, без body-part логіки).

### 8.3 Механіка голови (Head-Kill)

Коли ворог з `<bodyPart: head>` гине:

1. Плагін перехоплює `Game_Enemy.prototype.die()`
2. Знаходить всіх інших ворогів у тому ж troop
3. Кожен з них отримує HP = 0, стан Knockout
4. Battle Log: "Ви відсікли голову дракону! Тіло завмирає."

### 8.4 Механіка кінцівок ворога

Коли ворог з `<bodyPart: limb>` гине:

- Решта ворогів у troop отримує дебафф: ATK -15%
- Battle Log: "Ви відрубали лапу дракону!"
- Не вбиває решту

### 8.5 Сумісність з квестовою логікою

**Ключове обмеження**: Troops 5, 6, 7 мають квестову логіку (State 13 Demon, Item/Gold rewards) на Turn 0 page. Ця логіка **не чіпається** плагіном.

Плагін працює **тільки** через хуки на JS-рівні. Troop battle events залишаються для квестових тригерів.

**Правило**: для ворогів що вже мають troop events (Troops 1, 5-8), limb damage troop events **видаляються** при міграції. Квестові events (Turn 0 pages в Troops 5-7) **залишаються**.

### 8.6 Створення body-part ворогів

Для v1.0 body-part ворогів **не реалізовуємо**. Плагін містить код для розпізнавання notetag та head-kill механіки, але **жоден існуючий ворог не отримує notetag**. Це future-proof інфраструктура.

Причина: створення body-part ворогів вимагає нових Enemy entries, нових Troop конфігурацій, нових battler графіків — це контент-робота, не архітектурна.

---

## 9. ПОТІК ПОДІЙ (EVENT FLOW)

### 9.1 Ініціалізація

```
Гра запускається
  → Гравець обирає клас (Map006)
  → Перший бій
    → executeHpDamage hook перевіряє: limbData існує?
      → Ні: SDLimb.getData(actorId) створює default {hp:100 x4}
      → Так: використовує існуючі дані
```

Common Event 1 ("Initialize Limb HP") **більше не потрібен для нових збережень**. Залишається в БД для зворотної сумісності зі старими save файлами.

### 9.2 Бойовий цикл (Per Action)

```
Ворог обирає дію (AI)
  → BattleEngineCore обробляє action
    → executeHpDamage(target, damage) викликається
      → Стандартний HP damage застосовується
      → [HOOK] SDLimb.applyLimbDamage(target, skill, damage):
        1. Визначити limbTarget з notetag skill (або random)
        2. Обчислити limbDamage = floor(damage * 0.35)
        3. Застосувати модифікатори (maimed × 1.5, crit × 2.0)
        4. Зменшити limb.hp
        5. Перевірити пороги:
           - Перетин порогу → показати наративне повідомлення
           - HP <= 0 → тригер Crippled каскад
        6. Перевірити шанси статусів:
           - 10% Infected
           - Blood Loss якщо HP < 50
           - Maimed якщо damage >= 30
           - 5% Malformed
        7. Синхронізувати Variables 1-4 (якщо target = leader)
```

### 9.3 Кінець ходу (Turn End)

```
Turn End (обробляється плагіном, не troop events)
  → Для кожного актора в партії:
    → Для кожної кінцівки:
      - Якщо infected.active: timer += 1
        → timer >= 5: застосувати Poison state
        → timer >= 10: HP актора = 0 (смерть від інфекції)
      - Якщо bloodLoss.active: actor.hp -= floor(actor.mhp * 0.03 * stacks)
```

Hook: `BattleManager.endTurn` (або `Game_Battler.prototype.onTurnEnd`).

### 9.4 Поза боєм (Map Movement)

```
Game_Player moves (onPlayerWalk / Game_Party.prototype.onPlayerWalk)
  → stepCount перевіряється
  → Кожні 50 кроків:
    → Для кожного актора в партії:
      → Для кожної кінцівки:
        - Якщо NOT crippled AND NOT infected:
          - Якщо bloodLoss: regen 1 HP / 100 кроків (half rate)
          - Інакше: regen 1 HP / 50 кроків
        - Якщо infected: timer += 1 (map version)
          → timer >= 10: actor.hp = 0
        - Якщо bloodLoss: actor.hp -= floor(actor.mhp * 0.01 * stacks)
```

### 9.5 Кінець бою

```
Battle End (victory or escape)
  → Limb data НЕ скидається (зберігається між боями)
  → Статуси кінцівок НЕ знімаються
  → Синхронізація Variables 1-4 для лідера
```

---

## 10. ПЛАН МІГРАЦІЇ

### Крок 1: Створити плагін SD_LimbSystem.js

Файл: `js/plugins/SD_LimbSystem.js`
Додати в `plugins.js` **після** YEP_BattleEngineCore, **перед** RuneSkills.

### Крок 2: Додати в plugins.js

```json
{"name":"SD_LimbSystem","status":true,"description":"Limb Damage System for Shattered Dreams","parameters":{
  "Limb Damage Ratio":"0.35",
  "Regen Steps":"50",
  "Infection Kill Timer":"10",
  "Blood Loss Max Stacks":"3",
  "Maimed Damage Threshold":"30",
  "Malformed Chance":"5",
  "Show Narrative Messages":"true"
}}
```

### Крок 3: Оновити States в базі даних

Нові states (використати слоти 14-18):

| State ID | Назва | Призначення | Traits |
|----------|-------|-------------|--------|
| 11 | Crippled | Без змін (AGI-20, Hit 50%, DEF 65%) | Без змін |
| 14 | Limb Infected | Візуальний маркер для UI | Icon тільки |
| 15 | Limb Blood Loss | Візуальний маркер для UI | Icon тільки |
| 16 | Limb Maimed | Візуальний маркер для UI | Icon тільки |
| 17 | Limb Malformed | Візуальний маркер для UI | Icon тільки |

**Важливо**: States 14-17 — це **тільки іконки** для відображення в UI. Справжня логіка живе в `_limbData`. Плагін додає/знімає ці states на акторі якщо **хоча б одна** кінцівка має відповідний статус.

### Крок 4: Видалити limb damage з troop events

**Troops 1, 5, 6, 7, 8**: видалити Page 2 (Turn End limb damage).

**Troops 5, 6, 7**: **зберегти** Page 1 (Turn 0 quest logic — Demon state, rewards).

**Troop 1 (Bat*2)**: видалити Page 1 (Common Event 1 init) та Page 2 (limb damage). Troop стає чистим.

**Troop 8 (Dummy)**: видалити Page 2. Page 1 порожня, можна залишити.

### Крок 5: Зберегти Common Events 1-2

НЕ видаляти. Позначити в назві як legacy:
- CE 1: "[Legacy] Initialize Limb HP"
- CE 2: "[Legacy] Limb Damage Check"

Плагін не викликає їх, але вони залишаються для довідки та зворотної сумісності.

### Крок 6: Зворотна сумісність старих saves

При завантаженні старого save:
1. `$gameSystem._limbData` = undefined
2. Плагін перевіряє: якщо `_limbData` відсутня, ініціалізує з поточних Variables 1-4
3. Таким чином старі збереження міграються автоматично

```
// В хуку DataManager.extractSaveContents
if (!$gameSystem._limbData) {
    // Міграція зі старих змінних
    var leaderId = $gameParty.leader().actorId();
    var data = SDLimb.createDefaultData(leaderId);
    data.limbs.leftArm.hp = $gameVariables.value(1);
    data.limbs.rightArm.hp = $gameVariables.value(2);
    data.limbs.leftLeg.hp = $gameVariables.value(3);
    data.limbs.rightLeg.hp = $gameVariables.value(4);
    $gameSystem._limbData = {};
    $gameSystem._limbData[leaderId] = data;
}
```

### Крок 7: Протестувати

1. Нове збереження: створити Knight, зайти в бій з Bat*2, перевірити limb damage
2. Старе збереження: завантажити, перевірити міграцію змінних
3. Hunter/Priest: створити, зайти в бій — повинно працювати без змін
4. Crippled: довести кінцівку до 0 HP, перевірити equipment lock

---

## 11. АНАЛІЗ КРАЙНІХ ВИПАДКІВ

### 11.1 Смерть актора + знищення кінцівки

**Ситуація**: ворог вбиває актора (HP → 0) тим же ударом що знищує кінцівку.

**Обробка**: limb damage обробляється навіть якщо актор мертвий (тіло все ще отримує фізичні пошкодження). Crippled застосовується. Після воскресіння актор прокидається з Crippled та усіма limb статусами.

### 11.2 Кінець бою

**Limb data зберігається**. Не скидається. Статуси не знімаються. Гравець виходить з бою пораненим — це dark fantasy, не arcade.

### 11.3 Save / Load

**Автоматично** через `$gameSystem._limbData`. Тестування: зберегти з пораненою кінцівкою, завантажити — стан повинен зберегтися.

### 11.4 Множинна втрата кінцівок

**4 кінцівки знищені** = актор непритомніє (HP → 0). Не може битися. Це фактично перманентна смерть, якщо немає механізму відновлення.

### 11.5 Зміна лідера партії

При зміні лідера:
- Змінні 1-4 оновлюються для нового лідера
- Хук на `$gameParty.setMenuActor` або `leader()` change

### 11.6 Ворог без attack skill

Деякі вороги можуть мати тільки skill 1 (Attack) без notetag. За замовчуванням → `<limbTarget: random>`. Не зламає нічого.

### 11.7 Healing skills

**Lesser Healing (Skill 8)** та інші лікувальні навички: НЕ лікують кінцівки автоматично. Лікування кінцівок — окремий механізм через предмети або спеціальні навички з notetag:

```
<limbHeal: 20>          — лікує 20 HP найпошкодженішої кінцівки
<limbHealAll: 10>       — лікує 10 HP всім кінцівкам
<limbCureInfection>     — знімає Infected з однієї кінцівки
<limbCureBloodLoss: 1>  — знімає 1 стек Blood Loss
```

### 11.8 Магічний damage

Магічні атаки (формула з `a.mat`) за замовчуванням **не пошкоджують кінцівки** (`<limbTarget: none>` за замовчуванням для магічних skill). Тільки фізичний контакт ламає кості.

Виняток: якщо skill має explicit `<limbTarget: X>` notetag — тоді працює (fire ball в ногу).

**Визначення**: skill вважається "фізичним" якщо `hitType === 1` (physical) або `hitType === 0` (certain hit). `hitType === 2` (magical) → `<limbTarget: none>` за замовчуванням.

---

## 12. ПРОДУКТИВНІСТЬ

### 12.1 Overhead в бою

- 1 перевірка notetag на skill = O(1) з кешуванням (parse notetag один раз, зберегти в `skill._limbTarget`)
- 1 random roll + arithmetic = мікросекунди
- Variable sync = 4 виклики `$gameVariables.setValue` = мінімально

**Загальний overhead**: менше 1ms на action. Непомітно.

### 12.2 Overhead на карті

- Перевірка кожні 50 кроків = лічильник modulo, O(1)
- Ітерація по 4 кінцівках × N акторів у партії
- Поточно: 1 актор × 4 кінцівки = 4 перевірки

**Загальний overhead**: менше 0.1ms на крок. Непомітно.

### 12.3 Розмір save файлу

`_limbData` для 3 акторів ≈ 500 bytes JSON. Мізерно.

### 12.4 Кешування notetag

При першому доступі до skill notetag:
```
if (skill._limbTargetCached === undefined) {
    skill._limbTargetCached = SDLimb.parseNoteTag(skill.note);
}
return skill._limbTargetCached;
```

Парсинг regex один раз за гру, потім кеш.

---

## 13. ЗМІНИ В БАЗІ ДАНИХ

### 13.1 States.json

| State ID | Дія |
|----------|-----|
| 11 (Crippled) | Без змін |
| 14 | Створити: "Infected", icon TBD, permanent, no traits |
| 15 | Створити: "Blood Loss", icon TBD, permanent, no traits |
| 16 | Створити: "Maimed", icon TBD, permanent, no traits |
| 17 | Створити: "Malformed", icon TBD, permanent, no traits |

### 13.2 Items.json (нові предмети)

| Item | Ефект | Notetag |
|------|-------|---------|
| Антисептик | Лікує Infected | `<limbCureInfection>` |
| Бинт | Знімає 1 стек Blood Loss | `<limbCureBloodLoss: 1>` |
| Шина | Знімає Maimed | `<limbCureMaimed>` |

Конкретні Item ID — при реалізації (наступні вільні слоти).

### 13.3 Troops.json

| Troop | Дія |
|-------|-----|
| 1 (Bat*2) | Видалити Pages 1-2 (limb init + damage) |
| 2 (Slime*2) | Без змін |
| 3 (Orc) | Без змін |
| 4 (Minotaur) | Без змін |
| 5 (Monster 1) | Видалити Page 2 (limb damage). Зберегти Page 1 (quest) |
| 6 (Monster 2) | Видалити Page 2 (limb damage). Зберегти Page 1 (quest) |
| 7 (Monster 3) | Видалити Page 2 (limb damage). Зберегти Page 1 (quest) |
| 8 (Dummy) | Видалити Page 2 (limb damage) |

### 13.4 CommonEvents.json

| CE ID | Дія |
|-------|-----|
| 1 | Перейменувати на "[Legacy] Initialize Limb HP". Не видаляти |
| 2 | Перейменувати на "[Legacy] Limb Damage Check". Не видаляти |

### 13.5 plugins.js

Додати SD_LimbSystem між YEP_BattleEngineCore та HIME_LargeChoices (позиція 13, зсув інших).

### 13.6 Skills.json (notetags для ворожих атак)

Skill 1 (Attack): додати `<limbTarget: random>` в note (або залишити порожнім — default = random для фізичних).

Жодних інших змін у skills не потрібно для v1.0.

---

## 14. ПЛАН РЕАЛІЗАЦІЇ ПЛАГІНА

### 14.1 Структура файлу SD_LimbSystem.js

```
/*:
 * @plugindesc Limb Damage System for Shattered Dreams
 * @author Shattered Dreams Team
 *
 * @param Limb Damage Ratio
 * @desc Fraction of HP damage applied to limbs
 * @default 0.35
 *
 * @param Regen Steps
 * @desc Steps between regeneration ticks on map
 * @default 50
 *
 * ... (всі параметри)
 */
```

### 14.2 Модулі плагіна

1. **SDLimb (namespace)** — головний об'єкт
2. **Data Layer** — створення, доступ, серіалізація limbData
3. **Damage Hook** — перехоплення executeHpDamage
4. **Status Engine** — Infected/BloodLoss/Maimed/Malformed логіка
5. **Regen Engine** — регенерація на карті
6. **Turn End Hook** — тікання статусів у бою
7. **Equip Lock** — блокування слотів при Crippled
8. **Enemy Body Parts** — head-kill та limb-kill (інфраструктура)
9. **Narrative** — повідомлення в Battle Log
10. **Mirror Sync** — синхронізація з Variables 1-4
11. **Migration** — зворотна сумісність старих saves
12. **Notetag Parser** — парсинг `<limbTarget>`, `<bodyPart>`, `<limbHeal>`, etc.

### 14.3 Hooks (перехоплення)

| Метод MV | Тип | Призначення |
|----------|-----|-------------|
| `Game_Action.prototype.executeHpDamage` | alias | Додати limb damage після HP damage |
| `Game_Battler.prototype.onTurnEnd` | alias | Тікання limb статусів |
| `Game_Party.prototype.onPlayerWalk` | alias | Регенерація на карті |
| `Game_Actor.prototype.isEquipChangeOk` | override | Блокування equip слотів |
| `Game_Enemy.prototype.die` | alias | Head-kill та limb-kill |
| `DataManager.extractSaveContents` | alias | Міграція старих saves |
| `BattleManager.endBattle` | alias | Sync variables після бою |

### 14.4 Порядок реалізації

1. Data Layer + Mirror Sync + Migration
2. Notetag Parser
3. Damage Hook (core mechanic)
4. Status Engine (Infected, Blood Loss, Maimed, Malformed)
5. Crippled cascade + Equip Lock
6. Regen Engine
7. Turn End Hook
8. Narrative messages
9. Enemy Body Parts (infrastructure only)
10. Testing

### 14.5 Розмір коду (оцінка)

~600-800 рядків ES5 JavaScript. Один файл. Жодних залежностей.

---

## DARK FANTASY CONSISTENCY CHECKLIST

| Вимога | Реалізація |
|--------|------------|
| Жорстокість | Кінцівки знищуються назавжди, каскадні кровотечі та інфекції |
| Безжальність | Інфекція вбиває якщо не лікувати. 4 знищених кінцівки = смерть |
| Біологічна логіка | Рана → кровотеча → інфекція → смерть. Регенерація повільна, тільки поза боєм |
| Механічна значущість | Знищена кінцівка = втрата equip слоту, зменшення ATK/DEF/AGI |
| Не аркадна випадковість | Damage прив'язаний до реальних ворожих атак, не рандом на Turn End |
| Не косметичність | Crippled має реальні gameplay наслідки (equipment, stats) |
| Інтенціональність | Limb targeting через notetag — ворог цілить конкретно |

---

## ЧЕКЛІСТ ОБМЕЖЕНЬ

| Обмеження (з DECISIONS.md) | Статус |
|----------------------------|--------|
| Variables 1-7 зарезервовані | OK — дзеркальна синхронізація |
| Switch 1 зарезервований | OK — не використовується |
| Common Events 1-2 | OK — legacy, не видаляються |
| State 11 = Crippled | OK — зберігається, розширюється |
| Front-view DTB | OK — жодних змін |
| RuneSkills.js не змінювати | OK |
| ES5 only | OK |
| Plugins.js — єдине джерело | OK — додаємо тільки SD_LimbSystem |

---

**Цей документ є повною специфікацією. Чекаю підтвердження перед початком реалізації коду.**
