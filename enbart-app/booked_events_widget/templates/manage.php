<?php
declare(strict_types=1);

style('booked_events_widget', 'manage');

$buildDateParts = static function (string $date): array {
	$date = trim($date);
	if ($date === '') {
		return ['datum', 'saknas'];
	}

	$parts = preg_split('/\s+/', $date, 2);
	if ($parts === false || $parts === []) {
		return ['datum', $date];
	}

	if (count($parts) === 1) {
		return ['datum', $parts[0]];
	}

	return [mb_strtolower((string)$parts[0]), (string)$parts[1]];
};

$clientEvents = array_map(static function (array $event): array {
	$title = (string)$event['title'];
	$date = (string)$event['date'];
	$location = (string)$event['location'];

	return [
		'id' => (int)$event['id'],
		'title' => $title,
		'date' => $date,
		'location' => $location,
		'description' => (string)$event['description'],
		'link' => (string)$event['link'],
		'isApi' => (bool)($event['is_api'] ?? false),
		'isDemo' => false,
		'sortOrder' => (int)$event['sort_order'],
		'updateUrl' => (string)$event['updateUrl'],
		'saveStaffUrl' => (string)$event['saveStaffUrl'],
		'saveChatUrl' => (string)$event['saveChatUrl'],
		'uploadDocumentUrl' => (string)($event['uploadDocumentUrl'] ?? ''),
		'deleteUrl' => (string)$event['deleteUrl'],
		'staff' => array_values(array_map(static function (array $person): array {
			return [
				'userId' => (string)($person['userId'] ?? ''),
				'firstName' => (string)($person['firstName'] ?? ''),
				'lastName' => (string)($person['lastName'] ?? ''),
				'email' => (string)($person['email'] ?? ''),
				'phone' => (string)($person['phone'] ?? ''),
				'role' => (string)($person['role'] ?? ''),
				'area' => (string)($person['area'] ?? ''),
			];
		}, (array)($event['staff'] ?? []))),
		'material' => [],
		'marketing' => [],
		'documents' => array_values(array_map(static function (array $document): array {
			return [
				'id' => (string)($document['id'] ?? ''),
				'name' => (string)($document['name'] ?? ''),
				'mimeType' => (string)($document['mimeType'] ?? ''),
				'size' => (int)($document['size'] ?? 0),
				'uploadedAt' => (string)($document['uploadedAt'] ?? ''),
				'downloadUrl' => (string)($document['downloadUrl'] ?? ''),
				'deleteUrl' => (string)($document['deleteUrl'] ?? ''),
			];
		}, (array)($event['documents'] ?? []))),
		'chat' => array_values(array_map(static function (array $message): array {
			return [
				'type' => (string)($message['type'] ?? 'message'),
				'text' => (string)($message['text'] ?? ''),
				'senderLabel' => (string)($message['senderLabel'] ?? ''),
				'senderUserId' => (string)($message['senderUserId'] ?? ''),
				'createdAt' => (string)($message['createdAt'] ?? ''),
		];
	}, (array)($event['chat'] ?? []))),
	];
}, $_['events']);

if ((string)$_['viewMode'] === 'admin') {
	$clientEvents[] = [
		'id' => 999001,
		'title' => 'Testmässan',
		'date' => 'november 14-16',
		'location' => 'Stockholmsmässan • Monter B14',
		'description' => 'Demoevent för en större mässa där ett parti ska ställa ut. Här finns exempel på extern personal, materialbehov och marknadsföringsplanering för att kunna testa hela planeringsflödet.',
		'link' => 'https://example.com/testmassan',
		'isApi' => false,
		'isDemo' => true,
		'sortOrder' => 999999,
		'updateUrl' => '',
		'saveStaffUrl' => '',
		'saveChatUrl' => '',
		'uploadDocumentUrl' => '',
		'deleteUrl' => '',
		'staff' => [
			['userId' => '', 'firstName' => 'Monica', 'lastName' => 'Lind', 'email' => 'monica.lind@example.org', 'phone' => '070-123 45 67', 'role' => 'Eventansvarig', 'area' => 'Monteransvar och schema'],
			['userId' => '', 'firstName' => 'Johan', 'lastName' => 'Berg', 'email' => 'johan.berg@example.org', 'phone' => '070-234 56 78', 'role' => 'Talare', 'area' => 'Scenpresentation och publikkontakt'],
			['userId' => '', 'firstName' => 'Sara', 'lastName' => 'Holm', 'email' => 'sara.holm@example.org', 'phone' => '070-345 67 89', 'role' => 'Volontär', 'area' => 'Utdelning av material'],
			['userId' => '', 'firstName' => 'Emil', 'lastName' => 'Sund', 'email' => 'emil.sund@example.org', 'phone' => '070-456 78 90', 'role' => 'Logistik', 'area' => 'Transport och uppsättning'],
		],
		'material' => [
			['text' => 'Rollup och backdrop till montern', 'done' => true, 'ownerUserId' => '', 'ownerName' => 'Emil Sund', 'notes' => 'Lastas in kvällen före mässstart.'],
			['text' => 'Flyers och foldrar om partiets frågor', 'done' => false, 'ownerUserId' => '', 'ownerName' => 'Sara Holm', 'notes' => 'Tryckfiler klara men leverans väntas tisdag.'],
			['text' => 'Namnskyltar och profiltröjor', 'done' => false, 'ownerUserId' => '', 'ownerName' => 'Monica Lind', 'notes' => 'Kontrollera storlekar för alla i teamet.'],
			['text' => 'Skärm med presentationsloop', 'done' => true, 'ownerUserId' => '', 'ownerName' => 'Johan Berg', 'notes' => 'HDMI-adapter ligger i tekniklådan.'],
		],
		'marketing' => [
			['city' => 'Stockholm', 'mailSent' => 'Ja', 'facebookPages' => 'Lokala stadsdelsgrupper och mässans officiella sida', 'comment' => 'Prioriterad ort eftersom mässan hålls här.'],
			['city' => 'Uppsala', 'mailSent' => 'Ja', 'facebookPages' => 'Uppsalagrupper och närliggande studentforum', 'comment' => 'Bra pendlingsavstånd till eventet.'],
			['city' => 'Västerås', 'mailSent' => 'Nej', 'facebookPages' => 'Regionala evenemangssidor', 'comment' => 'Skickas när bemanning är helt bekräftad.'],
		],
		'documents' => [],
		'chat' => [
			['type' => 'system', 'text' => 'Det här är ett demoevent för att testa planeringsvyn.', 'senderLabel' => 'System', 'senderUserId' => '', 'createdAt' => ''],
			['type' => 'message', 'text' => 'Vi behöver dubbelkolla att montern får både el och två ståbord.', 'senderLabel' => 'Monica Lind', 'senderUserId' => '', 'createdAt' => '2026-03-18T08:15:00Z'],
			['type' => 'message', 'text' => 'Jag tar med skärmen och presentationsloopen på USB också.', 'senderLabel' => 'Johan Berg', 'senderUserId' => '', 'createdAt' => '2026-03-18T09:02:00Z'],
		],
	];
}
?>

<div
	class="bew-manage app"
	data-requesttoken="<?php p($_['requesttoken']); ?>"
	data-create-url="<?php p($_['createUrl']); ?>"
	data-state-url="<?php p($_['stateUrl']); ?>"
	data-view-mode="<?php p((string)$_['viewMode']); ?>"
>
	<script id="bew-state" type="application/json"><?php print_unescaped(json_encode(['events' => $clientEvents, 'users' => $_['users'], 'currentUser' => $_['currentUser']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></script>

	<section class="layout">
		<aside class="sidebar">
			<div class="sidebar-head">
				<h2 class="sidebar-title">Booked events</h2>
				<p class="sidebar-subtitle">Välj ett event i listan. Kortet till höger visar sammanfattning först och redigeringsytor direkt under.</p>
				<?php if ((string)$_['viewMode'] === 'eventpersonal' && $_['currentUser'] !== null): ?>
					<label class="sidebar-filter">
						<input type="checkbox" id="bookedOnlyToggle">
						<span class="sidebar-filter-switch" aria-hidden="true"></span>
						<span class="sidebar-filter-label">Visa bara event där jag är bokad</span>
					</label>
				<?php endif; ?>
			</div>

			<div class="event-list" id="eventList">
				<?php foreach ($clientEvents as $index => $event): ?>
					<?php [$dateTop, $dateBottom] = $buildDateParts((string)$event['date']); ?>
					<button class="event-card<?php p($index === 0 ? ' active' : ''); ?>" type="button" data-event-id="<?php p((string)$event['id']); ?>">
						<div class="event-date">
							<div class="event-month"><?php p($dateTop); ?></div>
							<div class="event-day"><?php p($dateBottom); ?></div>
						</div>
						<div class="event-body">
							<h3 class="event-title"><?php p((string)$event['title']); ?></h3>
							<p class="event-meta"><?php p((string)$event['location']); ?></p>
						</div>
					</button>
				<?php endforeach; ?>
			</div>
		</aside>

		<main class="main">
			<div class="main-head">
				<div class="main-kicker">Redigera</div>
				<div class="main-title-row">
					<div class="main-title">
						<h2 id="mainTitle">Event</h2>
						<div class="main-meta">
							<span class="badge" id="mainDateBadge">Datum</span>
							<span class="badge" id="mainLocationBadge">Plats</span>
						</div>
					</div>
					<div class="main-head-actions">
						<button class="btn btn-secondary" type="button" id="discardChangesBtn" hidden>Spara inte ändringar</button>
						<button class="btn btn-secondary" type="button" id="printSummaryBtn">Printa sammanfattning</button>
					</div>
				</div>
			</div>

			<div class="main-body">
				<div class="tabbar">
					<button class="tab-btn active" type="button" data-tab="overview">Översikt</button>
					<button class="tab-btn" type="button" data-tab="staff">Personal</button>
					<button class="tab-btn" type="button" data-tab="material">Material</button>
					<button class="tab-btn" type="button" data-tab="marketing">Marknadsföring</button>
					<button class="tab-btn" type="button" data-tab="documents">Dokument</button>
				</div>

				<div class="content-grid">
					<section class="panel editor-panel">
						<div id="dynamicContent"></div>
					</section>

					<aside class="panel chat-panel">
						<div class="chat-head">
							<h3 class="chat-title">Chat</h3>
							<p class="chat-sub">Intern samordning för eventet. Den här panelen ligger kvar när du byter flik.</p>
						</div>

						<div class="chat-box" id="chatBox"></div>

						<div class="chat-compose">
							<input class="chat-input" id="chatInput" type="text" placeholder="Skriv ett meddelande och tryck Enter">
							<button class="btn btn-accent" type="button" id="sendBtn">Skicka</button>
						</div>
					</aside>
				</div>
			</div>
		</main>
	</section>

	<div class="unsaved-modal" id="unsavedModal" hidden>
		<div class="unsaved-modal__backdrop"></div>
		<div class="unsaved-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="unsavedModalTitle">
			<h3 id="unsavedModalTitle">Osparade ändringar</h3>
			<p id="unsavedModalMessage">Du har osparade ändringar i den här vyn.</p>
			<div class="unsaved-modal__actions">
				<button class="btn btn-primary" type="button" id="unsavedSaveBtn">Spara ändringar</button>
				<button class="btn btn-secondary" type="button" id="unsavedDiscardBtn">Spara inte ändringar</button>
				<button class="btn btn-secondary" type="button" id="unsavedStayBtn">Stanna kvar</button>
			</div>
		</div>
	</div>
</div>
