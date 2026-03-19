<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Service;

use OCA\BookedEventsWidget\AppInfo\Application;

class EventService {
	/**
	 * @return list<array<string, int|string>>
	 */
	public function getEventsWithIds(): array {
		$events = [];

		foreach ($this->readRawEvents() as $index => $event) {
			$events[] = $this->normalizeEvent($event, $index);
		}

		usort($events, static function (array $left, array $right): int {
			$sortComparison = ((int)$left['sort_order']) <=> ((int)$right['sort_order']);
			if ($sortComparison !== 0) {
				return $sortComparison;
			}

			return ((int)$left['id']) <=> ((int)$right['id']);
		});

		return $events;
	}

	/**
	 * @return list<array<string, string>>
	 */
	public function getEvents(): array {
		return array_map(static fn (array $event): array => [
			'title' => (string)$event['title'],
			'date' => (string)$event['date'],
			'location' => (string)$event['location'],
			'description' => (string)$event['description'],
			'link' => (string)$event['link'],
			'isPast' => (bool)$event['is_past'],
		], $this->getEventsWithIds());
	}

	public function hasAnyEvents(): bool {
		return $this->readRawEvents() !== [];
	}

	/**
	 * @param list<array<string, int|string>> $events
	 */
	public function seedEvents(array $events): void {
		$this->writeRawEvents(array_map(function (array $event): array {
			return [
				'title' => (string)$event['title'],
				'date' => (string)$event['date'],
				'location' => (string)$event['location'],
				'description' => (string)($event['description'] ?? ''),
				'link' => (string)($event['link'] ?? ''),
				'sort_order' => (int)($event['sort_order'] ?? 0),
			];
		}, $events));
	}

	public function createEvent(string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$events = $this->readRawEvents();
		$events[] = [
			'title' => trim($title),
			'date' => trim($date),
			'location' => trim($location),
			'description' => trim($description),
			'link' => trim($link),
			'sort_order' => $sortOrder,
		];

		$this->writeRawEvents($events);
	}

	public function updateEvent(int $id, string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		$events[$id] = [
			'title' => trim($title),
			'date' => trim($date),
			'location' => trim($location),
			'description' => trim($description),
			'link' => trim($link),
			'sort_order' => $sortOrder,
		];

		$this->writeRawEvents($events);
	}

	public function deleteEvent(int $id): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		unset($events[$id]);

		$this->writeRawEvents(array_values($events));
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	private function readRawEvents(): array {
		$filePath = $this->getEventsFilePath();
		if (!is_file($filePath)) {
			return $this->getDefaultEvents();
		}

		$contents = file_get_contents($filePath);
		if ($contents === false) {
			return $this->getDefaultEvents();
		}

		$events = json_decode($contents, true);
		if (!is_array($events)) {
			return $this->getDefaultEvents();
		}

		$events = array_values(array_filter($events, static fn ($event): bool => is_array($event)));

		return $events !== [] ? $events : $this->getDefaultEvents();
	}

	/**
	 * @param list<array<string, mixed>> $events
	 */
	private function writeRawEvents(array $events): void {
		$filePath = $this->getEventsFilePath();
		$directory = dirname($filePath);

		if (!is_dir($directory)) {
			mkdir($directory, 0775, true);
		}

		file_put_contents(
			$filePath,
			(string)json_encode(array_values($events), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
		);
	}

	/**
	 * @param array<string, mixed> $event
	 * @return array<string, int|string>
	 */
	private function normalizeEvent(array $event, int $index): array {
		$title = $this->cleanText((string)($event['title'] ?? 'Event'));
		$date = $this->cleanText((string)($event['date'] ?? ''));
		$month = $this->cleanText((string)($event['month'] ?? ''));
		$day = $this->cleanText((string)($event['day'] ?? ''));
		$time = $this->cleanText((string)($event['time'] ?? ''));
		$place = $this->cleanText((string)($event['place'] ?? ''));
		$location = $this->cleanText((string)($event['location'] ?? ''));
		$description = $this->cleanText((string)($event['description'] ?? ''));
		$link = trim((string)($event['link'] ?? ''));

		if ($date === '') {
			$date = trim($month . ' ' . $day);
		}
		if ($date === '') {
			$date = 'Datum meddelas';
		}

		if ($location === '') {
			$location = $place;
		}
		if ($location !== '' && $time !== '') {
			$location .= ' • ' . $time;
		} elseif ($location === '' && $time !== '') {
			$location = $time;
		}
		if ($location === '') {
			$location = 'Plats meddelas';
		}

		if ($description === '') {
			$description = sprintf(
				'%s planeras till %s. %s',
				$title,
				mb_strtolower($date),
				$link !== '' ? 'Öppna länken för mer information.' : 'Mer information kommer senare.',
			);
		}

		return [
			'id' => $index,
			'title' => $title,
			'date' => $date,
			'location' => $location,
			'description' => $description,
			'link' => $link,
			'is_past' => $this->isPastEvent($month, $day),
			'sort_order' => (int)($event['sort_order'] ?? (($index + 1) * 10)),
		];
	}

	private function isPastEvent(string $month, string $day): bool {
		$monthMap = [
			'januari' => 1,
			'februari' => 2,
			'mars' => 3,
			'april' => 4,
			'maj' => 5,
			'juni' => 6,
			'juli' => 7,
			'augusti' => 8,
			'september' => 9,
			'oktober' => 10,
			'november' => 11,
			'december' => 12,
		];

		$monthNumber = $monthMap[mb_strtolower($month)] ?? null;
		if ($monthNumber === null) {
			return false;
		}

		if (!preg_match('/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/', $day, $matches)) {
			return false;
		}

		$endDay = isset($matches[2]) && $matches[2] !== ''
			? (int)$matches[2]
			: (int)$matches[1];

		try {
			$eventDate = new \DateTimeImmutable(sprintf('%d-%02d-%02d', (int)date('Y'), $monthNumber, $endDay));
			$today = new \DateTimeImmutable('today');
		} catch (\Exception) {
			return false;
		}

		return $eventDate < $today;
	}

	private function cleanText(string $value): string {
		$value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$value = preg_replace('/\s+/u', ' ', $value) ?? $value;

		return trim($value);
	}

	private function getEventsFilePath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/events.json';
	}

	/**
	 * @return list<array<string, int|string>>
	 */
	private function getDefaultEvents(): array {
		return [
			[
				'title' => 'Årsstämma',
				'date' => 'Datum meddelas',
				'location' => 'Information via medlemsmejl',
				'description' => 'Information om årsstämman skickas ut via medlemsmejl när program och plats är fastställda.',
				'link' => '',
				'sort_order' => 10,
			],
			[
				'title' => 'Seniorfestival Malmö',
				'date' => 'Kommande datum',
				'location' => 'Malmö',
				'description' => 'Seniorfestivalen samlar aktiviteter, inspiration och utställare för en aktiv och social vardag.',
				'link' => 'https://seniorfestivalen.se/malmo/',
				'sort_order' => 20,
			],
			[
				'title' => 'Afterwork med Ambition Sverige',
				'date' => 'Kommande datum',
				'location' => 'RG21',
				'description' => 'Ett informellt tillfälle att träffas, nätverka och prata vidare om kommande aktiviteter.',
				'link' => 'https://rg21.se/',
				'sort_order' => 30,
			],
			[
				'title' => 'Seniordagen',
				'date' => 'Kommande datum',
				'location' => 'Kungsträdgården',
				'description' => 'En dag fylld av utställare, föreläsningar och aktiviteter som inspirerar till en bättre framtid för seniorer.',
				'link' => 'https://seniordagen.com/seniordagen-i-stockholm/index',
				'sort_order' => 40,
			],
		];
	}
}
