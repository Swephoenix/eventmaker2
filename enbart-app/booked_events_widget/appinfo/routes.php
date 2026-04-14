<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#state', 'url' => '/state', 'verb' => 'GET'],
		['name' => 'page#create', 'url' => '/events', 'verb' => 'POST'],
		['name' => 'page#update', 'url' => '/events/{id}', 'verb' => 'POST'],
		['name' => 'page#saveStaff', 'url' => '/events/{id}/staff', 'verb' => 'POST'],
		['name' => 'page#saveChat', 'url' => '/events/{id}/chat', 'verb' => 'POST'],
		['name' => 'page#saveBudget', 'url' => '/events/{id}/budget', 'verb' => 'POST'],
		['name' => 'page#uploadDocument', 'url' => '/events/{id}/documents', 'verb' => 'POST'],
		['name' => 'page#deleteDocument', 'url' => '/events/{id}/documents/{documentId}/delete', 'verb' => 'POST'],
		['name' => 'page#downloadDocument', 'url' => '/events/{id}/documents/{documentId}', 'verb' => 'GET'],
		['name' => 'page#delete', 'url' => '/events/{id}/delete', 'verb' => 'POST'],
	],
];
