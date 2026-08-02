import { useEffect, useMemo, useState } from "react";
import { useUnit } from "effector-react";
import { createShellSheetController } from "@shell-sheet/core";
import { createMotionAnimationDriver } from "@shell-sheet/motion";
import {
  ShellSheet,
  type ShellSheetPresentation,
} from "@shell-sheet/react";
import {
  createLovecraftDemoModel,
  type DemoScreen,
} from "./model";
import {
  journeyLocationIds,
  locationById,
  locations,
  type AtlasLocation,
  type LocationId,
} from "./locations";

export type PrototypeVariant = "field-notes" | "cartographic" | "nocturne";

interface AppProps {
  variant: PrototypeVariant;
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="icon"
      data-direction={direction}
    >
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="icon">
      <path d="M5.5 17V3.5h9V17M3.5 17h13M11.5 10h.01" />
    </svg>
  );
}

function LocationCard({
  location,
  onSelect,
  onEnter,
}: {
  location: AtlasLocation;
  onSelect: (id: LocationId) => void;
  onEnter: (id: LocationId) => void;
}) {
  return (
    <article className="location-card" data-location={location.id}>
      <img src={location.image} alt="" draggable="false" />
      <div className="location-card__veil" aria-hidden="true" />
      <button
        className="location-card__info"
        type="button"
        onClick={() => onSelect(location.id)}
        aria-label={`Открыть информацию: ${location.title}`}
      />
      <div className="location-card__copy">
        <span className="location-card__index">{location.index}</span>
        <div>
          <p>{location.region}</p>
          <h2>{location.title}</h2>
        </div>
      </div>
      <button
        className="location-card__entrance"
        type="button"
        onClick={() => onEnter(location.id)}
      >
        <DoorIcon />
        <span>{location.entranceLabel}</span>
      </button>
    </article>
  );
}

function PresentationToggle({
  value,
  onChange,
}: {
  value: ShellSheetPresentation;
  onChange: (value: ShellSheetPresentation) => void;
}) {
  return (
    <div className="presentation-toggle" aria-label="Режим на десктопе">
      <span>Форма</span>
      <div className="segmented-control">
        <button
          type="button"
          data-active={value === "sheet" || undefined}
          aria-pressed={value === "sheet"}
          onClick={() => onChange("sheet")}
        >
          Sheet
        </button>
        <button
          type="button"
          data-active={value === "dialog" || undefined}
          aria-pressed={value === "dialog"}
          onClick={() => onChange("dialog")}
        >
          Modal
        </button>
      </div>
    </div>
  );
}

function PanelFooter({
  presentation,
  onPresentationChange,
  children,
}: {
  presentation: ShellSheetPresentation;
  onPresentationChange: (value: ShellSheetPresentation) => void;
  children: React.ReactNode;
}) {
  return (
    <footer className="panel-footer">
      <PresentationToggle
        value={presentation}
        onChange={onPresentationChange}
      />
      <div className="panel-actions">{children}</div>
    </footer>
  );
}

function LongFieldReport({ location }: { location: AtlasLocation }) {
  return (
    <div className="field-report">
      <img className="field-report__image" src={location.image} alt="" />
      <div className="panel-copy panel-copy--article">
        <p className="kicker">Полевая запись · 03</p>
        <h2>{location.title}: нижняя камера</h2>
        <p className="lede">
          За дверью нет ожидаемого погреба. Лестница уходит в сухую породу, а
          расстояние между ступенями постепенно увеличивается, будто проход
          рассчитан на иной шаг.
        </p>
        <section>
          <h3>Наблюдение I — геометрия</h3>
          <p>
            Через двадцать семь ступеней стены перестают сходиться в прямых
            углах. Фонарь всё ещё освещает их равномерно, однако тень помощника
            падает в противоположную сторону. Сделанные мелом отметки через час
            оказались впереди группы.
          </p>
        </section>
        <section>
          <h3>Наблюдение II — акустика</h3>
          <p>
            Звук сверху приходит с задержкой в четыре секунды. Звук снизу — до
            того, как он произведён. Мы прекратили проверку после того, как эхо
            назвало фамилию отсутствующего участника экспедиции.
          </p>
        </section>
        <blockquote>
          Не измеряйте глубину верёвкой. Катушка вернулась сухой, тёплой и на
          шесть метров длиннее.
        </blockquote>
        <section>
          <h3>Наблюдение III — предел</h3>
          <p>
            На уровне, который барометр считает поверхностью моря, начинается
            зал. Потолка не видно. В центре стоит каменная модель холмов, но
            Данвич на ней обозначен пустотой. Экспедиция завершена без входа в
            зал; журнал запечатан в архиве Мискатоника.
          </p>
        </section>
        <ul className="fact-list">
          {location.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function JourneyScreen({
  step,
  presentation,
  onPresentationChange,
  onExit,
  onBack,
  onNext,
}: {
  step: number;
  presentation: ShellSheetPresentation;
  onPresentationChange: (value: ShellSheetPresentation) => void;
  onExit: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const id = journeyLocationIds[step] ?? "arkham";
  const location = locationById[id];
  const isFirst = step === 0;
  const isLast = step === journeyLocationIds.length - 1;

  return (
    <div className="panel-screen panel-screen--journey">
      {isLast ? (
        <LongFieldReport location={location} />
      ) : (
        <div className="journey-layout">
          <img src={location.image} alt="" />
          <div className="panel-copy">
            <p className="kicker">
              Маршрут {step + 1} / {journeyLocationIds.length}
            </p>
            <h2>{location.title}</h2>
            <p className="lede">{location.summary}</p>
            {step === 1 ? (
              <div className="evidence-note">
                <span>Новая улика</span>
                Свет в конце причала совпадает с отметкой на полях архивного
                плана из Аркхэма.
              </div>
            ) : null}
          </div>
        </div>
      )}
      <PanelFooter
        presentation={presentation}
        onPresentationChange={onPresentationChange}
      >
        {isFirst ? (
          <button className="button button--quiet" type="button" onClick={onExit}>
            Выйти
          </button>
        ) : (
          <button className="button button--quiet" type="button" onClick={onBack}>
            <ArrowIcon direction="left" /> Назад
          </button>
        )}
        {isLast ? (
          <button className="button button--primary" type="button" onClick={onExit}>
            Завершить
          </button>
        ) : (
          <button className="button button--primary" type="button" onClick={onNext}>
            Вперёд <ArrowIcon />
          </button>
        )}
      </PanelFooter>
    </div>
  );
}

function PanelScreen({
  screen,
  snapPoint,
  presentation,
  onPresentationChange,
  onExit,
  onEnter,
  onBack,
  onNext,
}: {
  screen: DemoScreen;
  snapPoint: string;
  presentation: ShellSheetPresentation;
  onPresentationChange: (value: ShellSheetPresentation) => void;
  onExit: () => void;
  onEnter: (id: LocationId) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  if (screen.kind === "empty") return null;

  if (screen.kind === "journey") {
    return (
      <JourneyScreen
        step={screen.step}
        presentation={presentation}
        onPresentationChange={onPresentationChange}
        onExit={onExit}
        onBack={onBack}
        onNext={onNext}
      />
    );
  }

  const location = locationById[screen.locationId];

  if (screen.kind === "location-info") {
    return (
      <div className="panel-screen">
        <div className="panel-copy">
          <p className="kicker">{location.region}</p>
          <h2>{location.title}</h2>
          <p className="coordinates">{location.coordinates}</p>
          <p className="lede">{location.summary}</p>
          <div className="micro-fact">{location.facts[0]}</div>
        </div>
        <PanelFooter
          presentation={presentation}
          onPresentationChange={onPresentationChange}
        >
          <button className="button button--quiet" type="button" onClick={onExit}>
            Закрыть
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => onEnter(location.id)}
          >
            {location.entranceLabel} <ArrowIcon />
          </button>
        </PanelFooter>
      </div>
    );
  }

  if (screen.kind === "long-scroll") {
    return (
      <div className="panel-screen">
        <LongFieldReport location={location} />
        <PanelFooter
          presentation={presentation}
          onPresentationChange={onPresentationChange}
        >
          <button className="button button--primary" type="button" onClick={onExit}>
            Закрыть отчёт
          </button>
        </PanelFooter>
      </div>
    );
  }

  if (screen.kind === "image-flush") {
    return (
      <div className="panel-screen panel-screen--flush">
        <img className="flush-image" src={location.image} alt="" />
        <div className="panel-copy">
          <p className="kicker">Снимок экспедиции · 1931</p>
          <h2>{location.title}</h2>
          <p className="lede">{location.summary}</p>
          <ul className="fact-list">
            {location.facts.slice(0, 2).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <PanelFooter
          presentation={presentation}
          onPresentationChange={onPresentationChange}
        >
          <button className="button button--primary" type="button" onClick={onExit}>
            Свернуть снимок
          </button>
        </PanelFooter>
      </div>
    );
  }

  if (screen.kind === "progressive-reveal") {
    const expanded = snapPoint === "expanded";
    return (
      <div className="panel-screen panel-screen--progressive">
        <div className="panel-copy">
          <p className="kicker">{expanded ? "Полная запись" : "Краткая запись"}</p>
          <h2>{expanded ? "Журнал приливов" : location.title}</h2>
          <p className="lede">
            {expanded
              ? "После полуночи вода отступила дальше обычного. Под причалом обнаружилась дорога из чёрного камня и цепочка фонарей, горевших без огня."
              : location.summary}
          </p>
          {expanded ? (
            <>
              <img className="inline-image" src={location.image} alt="" />
              <ul className="fact-list">
                {location.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <p>
                Запись продолжается ещё на двенадцати страницах. Чернила на
                последних листах содержат соль, но бумага никогда не намокала.
              </p>
            </>
          ) : (
            <p className="drag-hint">Потяните за хендл, чтобы открыть журнал.</p>
          )}
        </div>
        <PanelFooter
          presentation={presentation}
          onPresentationChange={onPresentationChange}
        >
          <button className="button button--quiet" type="button" onClick={onExit}>
            Выйти
          </button>
        </PanelFooter>
      </div>
    );
  }

  const expanded = snapPoint === "expanded";
  return (
    <div className="panel-screen panel-screen--dreamlands">
      <div className="panel-copy">
        {expanded ? (
          <>
            <p className="kicker">Пространство навигации</p>
            <h2>Путь через третьи ворота</h2>
            <div className="route-diagram" aria-label="Маршрут из трёх этапов">
              <span data-complete>Берег сна</span>
              <span data-complete>Базальтовая лестница</span>
              <span>Северные ворота</span>
            </div>
            <p className="lede">
              В полной высоте панель становится навигационным инструментом:
              видны этапы, условия прохода и направление следующего шага.
            </p>
            <ul className="fact-list">
              {location.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="kicker">Сигнал без источника</p>
            <h2>Ворота Кадата</h2>
            <div className="signal-line" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i />
            </div>
            <p className="lede">
              В свёрнутом состоянии доступна только расшифровка сигнала.
              Поднимите панель, чтобы заменить её маршрутом.
            </p>
          </>
        )}
      </div>
      <PanelFooter
        presentation={presentation}
        onPresentationChange={onPresentationChange}
      >
        <button className="button button--quiet" type="button" onClick={onExit}>
          Выйти
        </button>
      </PanelFooter>
    </div>
  );
}

export function App({ variant }: AppProps) {
  const model = useMemo(() => createLovecraftDemoModel(), []);
  const controller = useMemo(
    () =>
      createShellSheetController({
        controlled: true,
        snapPoints: [
          { id: "peek", size: { type: "pixels", value: 290 } },
          { id: "content", size: { type: "content", maxRatio: 0.82 } },
          { id: "expanded", size: { type: "ratio", value: 0.94 } },
        ],
      }),
    [],
  );
  const animation = useMemo(() => createMotionAnimationDriver(), []);
  const [sceneElement, setSceneElement] = useState<HTMLElement | null>(null);
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const {
    screen,
    screenKey,
    presentation,
    direction,
    snapPoint,
    locationSelected,
    entranceOpened,
    nextRequested,
    previousRequested,
    exitRequested,
    presentationChanged,
  } = useUnit({
    screen: model.$screen,
    screenKey: model.$screenKey,
    presentation: model.$presentation,
    direction: model.$direction,
    snapPoint: model.sheet.$snapPoint,
    locationSelected: model.locationSelected,
    entranceOpened: model.entranceOpened,
    nextRequested: model.nextRequested,
    previousRequested: model.previousRequested,
    exitRequested: model.exitRequested,
    presentationChanged: model.presentationChanged,
  });

  useEffect(() => {
    const detach = model.sheet.attach(controller);
    return detach;
  }, [controller, model]);

  const modality = presentation === "dialog" ? "modal" : "non-modal";

  return (
    <div className="demo" data-variant={variant}>
      <div className="scene" ref={setSceneElement}>
        <header className="site-header">
          <div className="brand-mark" aria-hidden="true">A</div>
          <div className="site-title">
            <span>Мискатоникский архив</span>
            <strong>Атлас беспокойных мест</strong>
          </div>
          <p className="header-note">Экспедиционный файл · 1928–1931</p>
        </header>

        <main className="atlas" aria-label="Карта локаций">
          <div className="atlas-intro">
            <p className="kicker">Интерактивный полевой архив</p>
            <h1>Места, которых<br />не должно быть на карте</h1>
            <p>
              Нажмите на локацию для краткой записи или используйте вход,
              чтобы проверить отдельный сценарий адаптивной панели.
            </p>
          </div>
          <div className="location-grid">
            {locations.map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                onSelect={locationSelected}
                onEnter={entranceOpened}
              />
            ))}
          </div>
        </main>
      </div>

      <div ref={setPortalElement} className="sheet-portal-host" />

      {portalElement ? (
        <ShellSheet
          controller={controller}
          animation={animation}
          transitionKey={screenKey}
          direction={direction}
          presentation={presentation}
          modality={modality}
          draggable
          inertTarget={sceneElement}
          portalTarget={portalElement}
          label="Запись о локации"
          topInset={20}
          bottomInset={0}
          maxHeight={() => window.innerHeight - 28}
        >
          <PanelScreen
            screen={screen}
            snapPoint={snapPoint}
            presentation={presentation}
            onPresentationChange={presentationChanged}
            onExit={exitRequested}
            onEnter={entranceOpened}
            onBack={previousRequested}
            onNext={nextRequested}
          />
        </ShellSheet>
      ) : null}
    </div>
  );
}
