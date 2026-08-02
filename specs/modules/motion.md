# `@shell-sheet/motion`

## 1. Назначение

Пакет предоставляет animation driver для DOM adapter на базе только
`motion/mini`.

## 2. Dependency contract

- `motion` — единственная external runtime dependency.
- Импорт выполняется из `motion/mini`.
- `motion/react`, motion components, layout animations, motion values и
  встроенный drag запрещены.
- Package не зависит от React или Effector.

## 3. Driver behavior

`createMotionAnimationDriver()` переводит millisecond options DOM contract в
Motion seconds, сохраняет cubic-bezier tuple и возвращает standard controls.

- `stop()` идемпотентен.
- `finished` всегда resolve в `{ status: "finished" }` или
  `{ status: "cancelled" }`; штатная cancellation не reject.
- Motion cancel/reject нормализуется внутри driver согласованно с DOM contract;
  coordinator один решает terminal core fact.
- Driver не измеряет element и не выбирает keyframes или snap point.
- Retarget выполняется coordinator: предыдущий control останавливается, новый
  получает текущую computed geometry как from value.
- `motion/mini` даёт duration/easing animation. V1 не обещает физический spring
  с непрерывной release velocity; momentum отражается projected snap selection
  в core. Spring-capable driver MAY стать будущим расширением общего contract.

## 4. Bundle contract

CI измеряет tree-shaken browser contribution отдельного entry point. Target
budget для driver — 3 kB minified+gzip без учёта shared consumer copy Motion.
Точный budget подтверждается инструментом, а не заявлением в README.

## 5. Tests

Contract suite MUST быть тем же, что для native driver: finish, cancel,
idempotent stop, easing conversion, units и отсутствие unhandled rejection.
Static check запрещает imports из `motion/react` и `motion` hybrid entry.
