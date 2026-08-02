export type LocationId =
  | "arkham"
  | "innsmouth"
  | "dunwich"
  | "antarctica"
  | "dreamlands";

export type LocationBehavior =
  | "journey"
  | "progressive-reveal"
  | "long-scroll"
  | "image-flush"
  | "content-swap";

export interface AtlasLocation {
  id: LocationId;
  index: string;
  title: string;
  region: string;
  coordinates: string;
  summary: string;
  image: string;
  behavior: LocationBehavior;
  entranceLabel: string;
  facts: readonly string[];
}

export const locations: readonly AtlasLocation[] = [
  {
    id: "arkham",
    index: "01",
    title: "Аркхэм",
    region: "Долина Мискатоник",
    coordinates: "42°32′ N · 70°53′ W",
    summary:
      "Университетский город хранит больше каталогов, чем улиц, и не все записи в них относятся к известной истории.",
    image: "/locations/arkham.webp",
    behavior: "journey",
    entranceLabel: "Войти в библиотеку",
    facts: [
      "Архив открыт только до последнего удара башенных часов.",
      "Восточное крыло перестраивали трижды, но его план не менялся.",
      "Смотритель просит не отвечать на стук из закрытого каталога.",
    ],
  },
  {
    id: "innsmouth",
    index: "02",
    title: "Иннсмут",
    region: "Северное побережье",
    coordinates: "42°44′ N · 70°37′ W",
    summary:
      "Порт почти оставлен, но фонарь в конце причала зажигается каждую ночь — даже когда прилив скрывает доски.",
    image: "/locations/innsmouth.webp",
    behavior: "progressive-reveal",
    entranceLabel: "Осмотреть причал",
    facts: [
      "Отлив открывает каменную дорогу к рифу на семнадцать минут.",
      "В журнале порта отсутствуют страницы за 1846–1851 годы.",
      "Колокол на складе звучит из-под воды, а не с башни.",
    ],
  },
  {
    id: "dunwich",
    index: "03",
    title: "Данвич",
    region: "Внутренние холмы",
    coordinates: "42°28′ N · 72°19′ W",
    summary:
      "Дорога заканчивается у пустого дома. За ним камни отмечают окружность, слишком большую для старого фундамента.",
    image: "/locations/dunwich.webp",
    behavior: "long-scroll",
    entranceLabel: "Спуститься в погреб",
    facts: [
      "Компас отклоняется к центру круга, а не к северу.",
      "Местные карты называют один и тот же холм четырьмя именами.",
      "Под домом обнаружена лестница, глубина которой меняется после дождя.",
    ],
  },
  {
    id: "antarctica",
    index: "04",
    title: "Хребты без имени",
    region: "Антарктическое плато",
    coordinates: "76°15′ S · 113°10′ E",
    summary:
      "За ледником стоят чёрные стены, не отмеченные на аэрофотоснимках. Их масштаб становится понятен только рядом с лагерем.",
    image: "/locations/antarctica.webp",
    behavior: "image-flush",
    entranceLabel: "Открыть полевой снимок",
    facts: [
      "Температура камня на девять градусов выше температуры воздуха.",
      "Слои породы старше окружающего ледяного щита.",
      "Рельеф на воротах повторяет карту звёзд, видимую только в южную зиму.",
    ],
  },
  {
    id: "dreamlands",
    index: "05",
    title: "Кадат",
    region: "Северные Пределы Сна",
    coordinates: "координаты нестабильны",
    summary:
      "Лестница начинается там, где заканчивается знакомое небо. Внизу видны ворота; выше — город, которого нет наяву.",
    image: "/locations/dreamlands.webp",
    behavior: "content-swap",
    entranceLabel: "Подняться к воротам",
    facts: [
      "Первая площадка возвращает путника к месту отправления.",
      "На второй меняются названия созвездий.",
      "Третью видно только из пространства, открывающегося в полной высоте.",
    ],
  },
] as const;

export const locationById = Object.fromEntries(
  locations.map((location) => [location.id, location]),
) as Record<LocationId, AtlasLocation>;

export const journeyLocationIds: readonly LocationId[] = [
  "arkham",
  "innsmouth",
  "dunwich",
];
