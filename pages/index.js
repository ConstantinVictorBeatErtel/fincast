import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/app');
  }, [router]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Loading...</h1>
    </div>
  );
} 