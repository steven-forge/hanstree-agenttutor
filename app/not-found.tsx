import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><p>404</p><h1>문서를 찾을 수 없습니다.</h1><Link href="/">전체 문서로 돌아가기</Link></main>;
}
