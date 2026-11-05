package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.coreex.items.Item;
import com.coreex.links.LinkService;

class GraphEdgeCapTest {

	private static LinkService.GraphNode node(UUID id, int links) {
		return new LinkService.GraphNode(id, Item.Type.NOTE, "t", null, null, links, false, null, null, List.of());
	}

	@Test
	void keepsTheLinksBetweenTheMostLinkedItems() {
		var hub = UUID.randomUUID();
		var a = UUID.randomUUID();
		var b = UUID.randomUUID();
		var c = UUID.randomUUID();
		var graph = new LinkService.Graph(List.of(node(hub, 3), node(a, 2), node(b, 2), node(c, 1)),
				List.of(new LinkService.GraphEdge(b, c), new LinkService.GraphEdge(a, hub), new LinkService.GraphEdge(b, hub)),
				4, false, List.of());

		var kept = ReadTools.strongestEdges(graph, 2);

		assertThat(kept).hasSize(2);
		assertThat(kept).allSatisfy(e -> assertThat(e.target()).isEqualTo(hub));
		assertThat(ReadTools.strongestEdges(graph, 10)).hasSize(3);
	}

}
