<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#create', 'url' => '/events', 'verb' => 'POST'],
		['name' => 'page#update', 'url' => '/events/{id}', 'verb' => 'POST'],
		['name' => 'page#delete', 'url' => '/events/{id}/delete', 'verb' => 'POST'],
	],
];
