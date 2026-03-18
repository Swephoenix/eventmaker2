<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class EventService {
	private const TABLE = 'bew_events';

	public function __construct(
		private IDBConnection $db,
	) {
	}

	/**
	 * @return list<array<string, int|string>>
	 */
	public function getEventsWithIds(): array {
		if (!$this->hasAnyEvents()) {
			$this->seedEvents($this->getDefaultEvents());
		}

		$query = $this->db->getQueryBuilder();
		$query->select('id', 'title', 'event_date', 'location', 'status', 'sort_order')
			->from(self::TABLE)
			->orderBy('event_date', 'ASC')
			->addOrderBy('sort_order', 'ASC');

		$result = $query->executeQuery();
		$events = [];

		while ($row = $result->fetch()) {
			$events[] = [
				'id' => (int)$row['id'],
				'title' => (string)$row['title'],
				'date' => (string)$row['event_date'],
				'location' => (string)$row['location'],
				'status' => (string)$row['status'],
				'sort_order' => (int)$row['sort_order'],
			];
		}

		$result->closeCursor();

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
			'status' => (string)$event['status'],
		], $this->getEventsWithIds());
	}

	public function hasAnyEvents(): bool {
		$query = $this->db->getQueryBuilder();
		$query->select($query->func()->count('*', 'count'))
			->from(self::TABLE);

		$count = (int)$query->executeQuery()->fetchOne();

		return $count > 0;
	}

	/**
	 * @param list<array<string, int|string>> $events
	 */
	public function seedEvents(array $events): void {
		foreach ($events as $event) {
			$this->createEvent(
				(string)$event['title'],
				(string)$event['date'],
				(string)$event['location'],
				(string)$event['status'],
				(int)$event['sort_order'],
			);
		}
	}

	public function createEvent(string $title, string $date, string $location, string $status, int $sortOrder): void {
		$query = $this->db->getQueryBuilder();
		$query->insert(self::TABLE)
			->values([
				'title' => $query->createNamedParameter($title, IQueryBuilder::PARAM_STR),
				'event_date' => $query->createNamedParameter($date, IQueryBuilder::PARAM_STR),
				'location' => $query->createNamedParameter($location, IQueryBuilder::PARAM_STR),
				'status' => $query->createNamedParameter($status, IQueryBuilder::PARAM_STR),
				'sort_order' => $query->createNamedParameter($sortOrder, IQueryBuilder::PARAM_INT),
			])
			->executeStatement();
	}

	public function updateEvent(int $id, string $title, string $date, string $location, string $status, int $sortOrder): void {
		$query = $this->db->getQueryBuilder();
		$query->update(self::TABLE)
			->set('title', $query->createNamedParameter($title, IQueryBuilder::PARAM_STR))
			->set('event_date', $query->createNamedParameter($date, IQueryBuilder::PARAM_STR))
			->set('location', $query->createNamedParameter($location, IQueryBuilder::PARAM_STR))
			->set('status', $query->createNamedParameter($status, IQueryBuilder::PARAM_STR))
			->set('sort_order', $query->createNamedParameter($sortOrder, IQueryBuilder::PARAM_INT))
			->where($query->expr()->eq('id', $query->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->executeStatement();
	}

	public function deleteEvent(int $id): void {
		$query = $this->db->getQueryBuilder();
		$query->delete(self::TABLE)
			->where($query->expr()->eq('id', $query->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->executeStatement();
	}

	/**
	 * @return list<array<string, int|string>>
	 */
	private function getDefaultEvents(): array {
		return [
			[
				'title' => 'Sommarfest pa Tjoloholm',
				'date' => '2026-06-12',
				'location' => 'Kungsbacka',
				'status' => 'Bekraftad',
				'sort_order' => 10,
			],
			[
				'title' => 'Styrelsemiddag Q2',
				'date' => '2026-05-21',
				'location' => 'Grand Hotel',
				'status' => 'Meny vald',
				'sort_order' => 20,
			],
			[
				'title' => 'Produktlansering Nord',
				'date' => '2026-09-04',
				'location' => 'Stockholm Waterfront',
				'status' => 'Planering klar',
				'sort_order' => 30,
			],
			[
				'title' => 'Julmingel Goteborg',
				'date' => '2026-12-03',
				'location' => 'Magasinsgatan',
				'status' => 'Bokad lokal',
				'sort_order' => 40,
			],
		];
	}
}
