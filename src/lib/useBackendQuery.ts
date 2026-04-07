import { DependencyList, useEffect, useState } from 'react';

interface BackendQueryState<T> {
  data: T;
  error: string | null;
  isLoading: boolean;
}

export function useBackendQuery<T>(
  loader: () => Promise<T>,
  initialData: T,
  dependencies: DependencyList = [],
): BackendQueryState<T> {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await loader();
        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Something went wrong while loading backend data.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      isMounted = false;
    };
  }, dependencies);

  return { data, error, isLoading };
}
