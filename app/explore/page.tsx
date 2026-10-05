import type { Metadata } from "next";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import Image from "next/image";
import Link from "next/link";
import ExploreListClient from "./ExploreListClient";
import rawExplore from "../../data/explore.json";
import styles from "./webtoon-strip.module.css";

export const metadata: Metadata = {
  title: "Explore · AgentTutor",
  description: "궁금한 내용을 쉬운 설명·웹툰·제품 비교로 알아보세요."
};

type WebtoonImage = { src: string; width: number; height: number };
type WebtoonDoc = {
  slug: string;
  title: string;
  topic?: string;
  created_at: string;
  diagram_image?: WebtoonImage;
  comparison?: { comparison_image?: WebtoonImage };
};

const seenSrc = new Set<string>();
const webtoons = (rawExplore.docs as WebtoonDoc[])
  .map((doc, index) => ({ doc, index }))
  .sort((a, b) => b.doc.created_at.localeCompare(a.doc.created_at) || a.index - b.index)
  .flatMap(({ doc }) => [
    { doc, image: doc.diagram_image, isComparison: false },
    { doc, image: doc.comparison?.comparison_image, isComparison: true }
  ])
  .filter((item): item is typeof item & { image: WebtoonImage } => {
    if (!item.image || seenSrc.has(item.image.src)) return false;
    seenSrc.add(item.image.src);
    return true;
  });

export default function ExplorePage() {
  return (
    <>
      <SiteHeader currentPath="/explore" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/explore" />
        <main className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">EXPLORE</p>
            <h1>Explore</h1>
            <p>궁금한 내용을 쉬운 설명·웹툰·제품 비교로 알아보세요.</p>
          </header>

          {webtoons.length > 0 && (
            <section className={styles.section} id="webtoons" aria-labelledby="webtoons-title">
              <h2 id="webtoons-title">웹툰으로 둘러보기</h2>
              <p>좌우로 넘겨보고, 카드를 누르면 자세한 설명을 볼 수 있어요.</p>
              <ul className={styles.strip}>
                {webtoons.map(({ doc, image, isComparison }, i) => (
                  <li className={styles.item} key={image.src}>
                    <Link className={styles.card} href={`/explore/${doc.slug}`}>
                      <span className={styles.frame}>
                        <Image
                          src={image.src}
                          alt=""
                          fill
                          sizes="(max-width: 767px) 90vw, 352px"
                          loading={i === 0 ? "eager" : "lazy"}
                        />
                      </span>
                      {isComparison && <span className={styles.badge}>비교 웹툰</span>}
                      <span className={styles.title}>{doc.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={{ marginTop: "32px" }} id="documents">
            <h2>전체 문서</h2>
            <div style={{ marginTop: "16px" }}>
              <ExploreListClient />
            </div>
          </section>
        </main>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            {webtoons.length > 0 && <a href="#webtoons">웹툰으로 둘러보기</a>}
            <a href="#documents">전체 문서</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
